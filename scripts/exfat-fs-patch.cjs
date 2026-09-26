/**
 * Solo sviluppo locale su dischi exFAT (es. D:\ di questa macchina).
 * Su exFAT Node restituisce EISDIR da readlink() su file normali, invece di EINVAL
 * ("non è un symlink"): webpack/Next interpretano l'errore come fatale.
 * Questo preload converte EISDIR → EINVAL. Non serve (e non viene usato) su NTFS/Linux/CI.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- preload CommonJS caricato con node --require
const fs = require("fs");

function toEinval(err) {
  if (err && err.code === "EISDIR" && err.syscall === "readlink") {
    err.code = "EINVAL";
    err.errno = -22;
  }
  return err;
}

const readlink = fs.readlink;
fs.readlink = function (path, options, cb) {
  const callback = typeof options === "function" ? options : cb;
  const opts = typeof options === "function" ? undefined : options;
  return readlink.call(fs, path, opts, (err, res) => callback(toEinval(err), res));
};

const readlinkSync = fs.readlinkSync;
fs.readlinkSync = function (...args) {
  try {
    return readlinkSync.apply(fs, args);
  } catch (err) {
    throw toEinval(err);
  }
};

const promisesReadlink = fs.promises.readlink;
fs.promises.readlink = async function (...args) {
  try {
    return await promisesReadlink.apply(fs.promises, args);
  } catch (err) {
    throw toEinval(err);
  }
};
