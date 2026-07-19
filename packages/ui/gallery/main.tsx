import { createRoot } from "react-dom/client";
import "../src/theme.css";
import "../src/primitives.css";
import "../src/fonts/fonts.css";
import "./gallery.css";
import { GalleryApp } from "./app.js";

const root = document.getElementById("root");
if (root === null) throw new Error("gallery root element missing");
createRoot(root).render(<GalleryApp />);
