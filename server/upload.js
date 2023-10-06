import express from "express";
import upload from "jquery-file-upload-middleware";

import config from "../config.js";

var app = express.Router();

var uploadOptions = {
  tmpDir: ".tmp",
  uploadDir: "./uploads",
  uploadUrl: "/uploads",
  imageVersions: { thumbnail: { width: 90, height: 90 } },
  ssl: config.ssl,
};
app.use("/", upload.fileHandler(uploadOptions));

export default app;
