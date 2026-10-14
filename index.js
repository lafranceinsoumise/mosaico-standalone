import app from "./server/app.js";

const port = process.env.PORT || 3000;

app.listen(port, "127.0.0.1", (err) => {
  if (err) throw err;

  console.log("Listening on http://localhost:" + port);
});
