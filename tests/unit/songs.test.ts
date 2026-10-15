import { describe, expect, it } from "vitest";
import type { Timestamp } from "firebase/firestore";
import { playlistAudienceOf, songNotesOf } from "@/services/playlistService";
import type { Playlist, Song, WithId } from "@/types";

const ts = null as unknown as Timestamp;
const playlist = (id: string, songIds: string[], audience: string[]): WithId<Playlist> => ({
  id, title: id, songIds, audience, studentIds: [], groupIds: audience, createdBy: "t", keywords: [], createdAt: ts, updatedAt: ts,
});
const song = (id: string, items: Song["items"]): WithId<Song> => ({
  id, title: id, items, materialIds: items.map((i) => i.materialId), audience: [], createdBy: "t", keywords: [], createdAt: ts, updatedAt: ts,
});

describe("brani per gruppo (ADR D29)", () => {
  const songs = [
    song("hallelujah", [
      { materialId: "base", groupIds: [] },
      { materialId: "parte-soprani", groupIds: ["soprani"] },
      { materialId: "parte-bassi", groupIds: ["bassi"] },
    ]),
  ];

  it("i materiali per tutti arrivano a chi riceve la playlist, quelli per gruppo solo al gruppo", () => {
    const playlists = [playlist("saggio", ["hallelujah"], ["coro", "luca"])];
    expect(playlistAudienceOf("base", { playlists, songs }).sort()).toEqual(["coro", "luca"]);
    expect(playlistAudienceOf("parte-soprani", { playlists, songs })).toEqual(["soprani"]);
    expect(playlistAudienceOf("parte-bassi", { playlists, songs })).toEqual(["bassi"]);
  });

  it("una playlist non condivisa, o senza il brano, non rende visibile nulla", () => {
    expect(playlistAudienceOf("base", { playlists: [playlist("bozza", ["hallelujah"], [])], songs })).toEqual([]);
    expect(playlistAudienceOf("parte-soprani", { playlists: [playlist("altro", [], ["coro"])], songs })).toEqual([]);
  });
});
describe("note del brano nella playlist", () => {
  const p = {
    songNotes: {
      hallelujah: [
        { id: "1", text: "Respira prima del ritornello", groupIds: [] },
        { id: "2", text: "Soprani: attacco piano", groupIds: ["soprani"] },
        { id: "3", text: "Bassi: tenete il Re", groupIds: ["bassi"] },
      ],
    },
  };

  it("il docente le vede tutte, lo studente quelle per tutti e del suo gruppo", () => {
    expect(songNotesOf(p, "hallelujah").map((n) => n.id)).toEqual(["1", "2", "3"]);
    expect(songNotesOf(p, "hallelujah", ["luca", "soprani"]).map((n) => n.id)).toEqual(["1", "2"]);
    expect(songNotesOf(p, "hallelujah", ["luca"]).map((n) => n.id)).toEqual(["1"]);
  });

  it("un brano senza note, o una playlist senza note, non ne ha", () => {
    expect(songNotesOf(p, "altro", ["luca"])).toEqual([]);
    expect(songNotesOf({}, "hallelujah")).toEqual([]);
  });
});
