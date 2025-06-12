import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      default:"other",
    },
    image: {
      type: String,
      required: true,
    },
    stock: {
      type: Number,
      default: 0,
    },
  
    unit: {
      // added unit field (for example: liter, kg, piece)
      type: String,
      require:true
    },
  },
  {
    timestamps: true,
  }
);

// Add index for category and search
productSchema.index({ category: 1 });
productSchema.index({ name: "text" });

const Product = mongoose.model("Product", productSchema);

export default Product;
