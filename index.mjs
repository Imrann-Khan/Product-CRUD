import "dotenv/config";
import express from 'express';
import cors from "cors";
import records from "./routes/post.mjs";
import "./loadEnvironment.mjs";

const PORT = process.env.PORT || 5050;
const app = express();

app.use(cors());
app.use(express.json());
app.use("/", records);

// start the Express server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});