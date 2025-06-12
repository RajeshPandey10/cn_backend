import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createDirectories = () => {
  const dirs = ["uploads", "uploads/products", "uploads/reviews"];

  dirs.forEach((dir) => {
    const fullPath = path.join(__dirname, "../../", dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`Created directory: ${fullPath}`);
    }
  });

  // Add placeholder image if it doesn't exist
  const placeholderPath = path.join(__dirname, "../../uploads/placeholder.jpg");
  if (!fs.existsSync(placeholderPath)) {
    // Copy placeholder image from assets or create a basic one
    const defaultPlaceholder = path.join(
      __dirname,
      "../assets/placeholder.jpg"
    );
    if (fs.existsSync(defaultPlaceholder)) {
      fs.copyFileSync(defaultPlaceholder, placeholderPath);
    }
  }
};

export default createDirectories;
