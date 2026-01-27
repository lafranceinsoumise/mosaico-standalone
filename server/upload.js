import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const app = express.Router();

const uploadDir = "./uploads";
const tmpDir = ".tmp";

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
});

app.post("/", upload.any(), (req, res) => {
  const files = req.files.map((file) => ({
    name: file.filename,
    size: file.size,
    url: `/uploads/${file.filename}`,
    thumbnailUrl: `/uploads/${file.filename}`,
    deleteUrl: `/upload/${file.filename}`,
    deleteType: "DELETE",
  }));

  res.json({ files });
});

app.delete("/:name", (req, res) => {
  const filePath = path.join(uploadDir, req.params.name);
  fs.unlink(filePath, () => {
    res.json({ success: true });
  });
});

export default app;
