import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import express from "express";
import multer from "multer";
import sharp from "sharp";

const UPLOAD_DIR = "./uploads";
const THUMBNAIL_DIR = path.join(UPLOAD_DIR, "thumbnail");
const FORMATS = { jpeg: ".jpg", png: ".png", gif: ".gif", webp: ".webp" };
const IMAGE_NAME = /\.(jpe?g|png|gif|webp)$/i;

await fs.mkdir(THUMBNAIL_DIR, { recursive: true });

const app = express.Router();

const parseUpload = multer({
  dest: ".tmp",
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
}).array("files[]");

function fileInfo(req, name, size) {
  const base = `${req.protocol}://${req.host}/uploads`;
  return {
    name,
    size,
    url: `${base}/${encodeURIComponent(name)}`,
    thumbnailUrl: `${base}/thumbnail/${encodeURIComponent(name)}`,
  };
}

async function store(req, file) {
  try {
    const { format } = await sharp(file.path).metadata();
    if (!FORMATS[format]) {
      return { name: file.originalname, error: "Filetype not allowed" };
    }

    const name = randomUUID() + FORMATS[format];
    await fs.copyFile(file.path, path.join(UPLOAD_DIR, name));
    await sharp(file.path)
      .autoOrient()
      .resize(90, 90, { fit: "inside" })
      .toFile(path.join(THUMBNAIL_DIR, name));

    return fileInfo(req, name, file.size);
  } catch (e) {
    return { name: file.originalname, error: "Invalid image" };
  } finally {
    await fs.rm(file.path, { force: true });
  }
}

app.get("/", async (req, res) => {
  const entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((e) => e.isFile() && IMAGE_NAME.test(e.name))
      .map(async (e) => {
        const { size } = await fs.stat(path.join(UPLOAD_DIR, e.name));
        return fileInfo(req, e.name, size);
      }),
  );

  res.set("Cache-Control", "no-store").json({ files });
});

app.post("/", parseUpload, async (req, res) => {
  const files = [];
  for (const file of req.files || []) {
    files.push(await store(req, file));
  }

  res.set("Cache-Control", "no-store").json({ files });
});

export default app;
