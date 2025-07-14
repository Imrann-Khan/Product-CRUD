import { Router } from "express";
import cors from "cors";
import db from "../db/connections.mjs";
import { ObjectId } from "mongodb";
import { generateProductCode } from "../utils/productCodeGen.js";

const router = Router();

router.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'], // Add your frontend URLs
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

//Get all products with filtering
export async function getProducts(req, res) {
  try {
    const { category, search, status, minPrice, maxPrice, discount } = req.query;
    const q = {};
    
    // Category filter
    if (category) {
      // Support both category ID and category name
      if (ObjectId.isValid(category)) {
        q.category = new ObjectId(category);
      } else {
        // Search by category name
        const categoryDoc = await db.collection("categories").findOne({ 
          name: { $regex: category, $options: 'i' } 
        });
        if (categoryDoc) {
          q.category = categoryDoc._id;
        }
      }
    }
    
    // Search by product name
    if (search) {
      q.name = { $regex: search, $options: 'i' };
    }
    
    // Search by stock status
    if (status) {
      q.status = status;
    }
    
    // Search by Price range filter
    if (minPrice || maxPrice) {
      q.price = {};
      if (minPrice) q.price.$gte = Number(minPrice);
      if (maxPrice) q.price.$lte = Number(maxPrice);
    }
    
    // Search by Discount filter
    if (discount) {
      q.discount = { $gte: Number(discount) };
    }

    let collection = await db.collection("products");
    const products = await collection.find(q).toArray();

    // Get category names for the response
    const categoryIds = [...new Set(products.map(p => p.category))];
    const categories = await db.collection("categories").find({ 
      _id: { $in: categoryIds } 
    }).toArray();
    
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat._id.toString()] = cat.name;
    });

    const data = products.map(p => ({
      id: p._id,
      name: p.name,
      description: p.description,
      originalPrice: p.price,
      finalPrice: +(p.price * (1 - p.discount / 100)).toFixed(2),
      discount: p.discount,
      image: p.image,
      status: p.status,
      category: p.category,
      categoryName: categoryMap[p.category.toString()] || 'Unknown',
      productCode: p.productCode
    }));

    res.json({
      products: data,
      count: data.length,
      filters: {
        category,
        search,
        status,
        minPrice,
        maxPrice,
        discount
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

//Get all categories
export async function getCategories(req, res) {
  try {
    let collection = await db.collection("categories");
    const categories = await collection.find({}).toArray();
    
    const data = categories.map(cat => ({
      id: cat._id,
      name: cat.name,
      description: cat.description
    }));

    res.json(data);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// GET /api/products/categories/:categoryId/products - Get products by category
export async function getProductsByCategory(req, res) {
  try {
    const { categoryId } = req.params;

    if (!ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }

    const { search, status, minPrice, maxPrice, discount } = req.query;
    
    const category = await db.collection("categories").findOne({ 
      _id: new ObjectId(categoryId) 
    });
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    const q = { category: new ObjectId(categoryId) };

    let collection = await db.collection("products");
    const products = await collection.find(q).toArray();

    const data = products.map(p => ({
      id: p._id,
      name: p.name,
      description: p.description,
      originalPrice: p.price,
      finalPrice: +(p.price * (1 - p.discount / 100)).toFixed(2),
      discount: p.discount,
      image: p.image,
      status: p.status,
      category: p.category,
      categoryName: category.name,
      productCode: p.productCode
    }));

    res.json({
      category: {
        id: category._id,
        name: category.name,
        description: category.description
      },
      products: data,
      count: data.length
    });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// Create a new product
export async function createProduct(req, res) {
  try {
    // Check if request body exists
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: 'Request body is required' });
    }

    const { name, description, price, discount, image, status, category } = req.body;
    
    // Validate required fields
    if (!name || !description || !price || !category) {
      return res.status(400).json({ message: 'Missing required fields: name, description, price, category' });
    }
    
    // Validate category exists
    const cat = await db.collection("categories").findOne({ _id: new ObjectId(category) });
    if (!cat) return res.status(400).json({ message: 'Invalid category' });
    
    const productCode = generateProductCode(name);
    
    let collection = await db.collection("products");
    const product = {
      name, 
      description, 
      price: Number(price), 
      discount: Number(discount) || 0, 
      image: image || '', 
      status: status || 'active', 
      category: new ObjectId(category),
      productCode,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await collection.insertOne(product);
    
    const responseData = {
      id: result.insertedId,
      name: product.name,
      description: product.description,
      originalPrice: product.price,
      finalPrice: +(product.price * (1 - product.discount / 100)).toFixed(2),
      discount: product.discount,
      image: product.image,
      status: product.status,
      category: product.category,
      categoryName: cat.name,
      productCode: product.productCode
    };
    
    res.status(201).json(responseData);
  } catch (err) {
    console.error('Create product error:', err);
    if (err.code === 11000) return res.status(409).json({ message: 'Duplicate product code' });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// Update a product
export async function updateProduct(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: 'Request body is required' });
    }

    const allowed = (({ status, description, discount, name, price, image, category }) => ({ 
      status, description, discount, name, price, image, category 
    }))(req.body);
    
    if (allowed.price !== undefined) allowed.price = Number(allowed.price);
    if (allowed.discount !== undefined) allowed.discount = Number(allowed.discount);
    
    if (allowed.category !== undefined) {
      if (ObjectId.isValid(allowed.category)) {
        allowed.category = new ObjectId(allowed.category);
      } else {
        return res.status(400).json({ message: 'Invalid category ID format' });
      }
    }
    
    Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key]);
    
    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
    allowed.updatedAt = new Date();
    
    let collection = await db.collection("products");
    
    const updateResult = await collection.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) }, 
      { $set: allowed }, 
      { returnDocument: 'after' }
    );
    
    if (!updateResult || !updateResult.value) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    const updatedProduct = updateResult.value;
    
    // Check category name
    let category = null;
    if (updatedProduct.category && ObjectId.isValid(updatedProduct.category)) {
      category = await db.collection("categories").findOne({ 
        _id: new ObjectId(updatedProduct.category) 
      });
    }
    
    const data = {
      id: updatedProduct._id,
      name: updatedProduct.name,
      description: updatedProduct.description,
      originalPrice: updatedProduct.price,
      finalPrice: +(updatedProduct.price * (1 - updatedProduct.discount / 100)).toFixed(2),
      discount: updatedProduct.discount,
      image: updatedProduct.image,
      status: updatedProduct.status,
      category: updatedProduct.category,
      categoryName: category ? category.name : 'Unknown',
      productCode: updatedProduct.productCode
    };
    
    res.json(data);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

//Delete a product
export async function deleteProduct(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    const query = { _id: new ObjectId(req.params.id) };
    const collection = db.collection("products");
    
    const existingProduct = await collection.findOne(query);
    if (!existingProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    const result = await collection.deleteOne(query);
    
    if (result.deletedCount === 1) {
      res.status(200).json({ 
        message: 'Product deleted successfully',
        deletedId: req.params.id 
      });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// GET all products with enhanced filtering
router.get("/", async (req, res) => {
  getProducts(req, res);  
});

// GET all categories
router.get("/categories", async (req, res) => {
  getCategories(req, res);
});

// GET products by category
router.get("/categories/:categoryId/products", async (req, res) => {
  getProductsByCategory(req, res);
});

// GET single product
router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    let collection = await db.collection("products");
    
    let result = await collection.findOne({ _id: new ObjectId(req.params.id) });
    
    if (!result) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let category = null;
    if (result.category && ObjectId.isValid(result.category)) {
      category = await db.collection("categories").findOne({ 
        _id: new ObjectId(result.category) 
      });
    }
    
    const data = {
      id: result._id,
      name: result.name,
      description: result.description,
      originalPrice: result.price,
      finalPrice: +(result.price * (1 - result.discount / 100)).toFixed(2),
      discount: result.discount,
      image: result.image,
      status: result.status,
      category: result.category,
      categoryName: category ? category.name : 'Unknown',
      productCode: result.productCode
    };
    
    res.json(data);
  } catch (error) {
    console.error('Get/Update error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST create product
router.post("/", async (req, res) => {
  createProduct(req, res);
});

// PATCH update product
router.patch("/:id", async (req, res) => {
  updateProduct(req, res);
});

// DELETE product
router.delete("/:id", async (req, res) => {
  deleteProduct(req, res);
});

// DEBUG ROUTES (can be removed in production)
router.get("/debug/check", async (req, res) => {
  try {
    let productsCollection = await db.collection("products");
    let categoriesCollection = await db.collection("categories");
    
    let productsCount = await productsCollection.countDocuments();
    let categoriesCount = await categoriesCollection.countDocuments();
    
    let sampleProduct = await productsCollection.findOne();
    let sampleCategory = await categoriesCollection.findOne();
    
    res.json({
      productsCount,
      categoriesCount,
      sampleProduct,
      sampleCategory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Insert some sample data at a time sample data
router.post("/debug/populate", async (req, res) => {
  try {
    let productsCollection = await db.collection("products");
    let categoriesCollection = await db.collection("categories");
    
    //Add categories
    const categories = [
      { name: "Electronics", description: "Electronic devices and gadgets" },
      { name: "Clothing", description: "Apparel and fashion items" },
      { name: "Books", description: "Books and educational materials" },
      { name: "Home & Garden", description: "Home improvement and gardening" },
      { name: "Sports", description: "Sports equipment and accessories" },
      { name: "Beauty", description: "Beauty and personal care products" }
    ];
    
    const categoryResult = await categoriesCollection.insertMany(categories);
    const categoryIds = Object.values(categoryResult.insertedIds);
    
    // Add products
    const products = [
      {
        name: "iPhone 15 Pro",
        description: "Latest Apple smartphone with advanced features and A17 Pro chip",
        price: 999,
        discount: 10,
        image: "iphone15-pro.jpg",
        status: "active",
        category: categoryIds[0],
        productCode: "IPH-15P-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Samsung Galaxy S24 Ultra",
        description: "High-end Android smartphone with S Pen and AI features",
        price: 1199,
        discount: 15,
        image: "galaxy-s24-ultra.jpg",
        status: "active",
        category: categoryIds[0],
        productCode: "SAM-S24U-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "MacBook Pro 14-inch",
        description: "Apple MacBook Pro with M3 chip for professional work",
        price: 1999,
        discount: 5,
        image: "macbook-pro-14.jpg",
        status: "active",
        category: categoryIds[0],
        productCode: "APP-MBP14-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Nike Air Max 270",
        description: "Comfortable running shoes with Air Max technology",
        price: 150,
        discount: 25,
        image: "nike-air-max-270.jpg",
        status: "active",
        category: categoryIds[1],
        productCode: "NIK-AM270-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Adidas Ultraboost 22",
        description: "Premium running shoes with Boost technology",
        price: 180,
        discount: 20,
        image: "adidas-ultraboost-22.jpg",
        status: "active",
        category: categoryIds[1],
        productCode: "ADI-UB22-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "JavaScript: The Definitive Guide",
        description: "Comprehensive guide to JavaScript programming",
        price: 59.99,
        discount: 0,
        image: "js-definitive-guide.jpg",
        status: "active",
        category: categoryIds[2],
        productCode: "ORE-JDG-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Clean Code",
        description: "A handbook of agile software craftsmanship",
        price: 49.99,
        discount: 10,
        image: "clean-code.jpg",
        status: "active",
        category: categoryIds[2],
        productCode: "PH-CC-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Robot Vacuum Cleaner",
        description: "Smart robot vacuum with mapping and app control",
        price: 299,
        discount: 30,
        image: "robot-vacuum.jpg",
        status: "active",
        category: categoryIds[3],
        productCode: "RV-SMART-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Garden Tool Set",
        description: "Complete 10-piece garden tool set for all your gardening needs",
        price: 79.99,
        discount: 15,
        image: "garden-tool-set.jpg",
        status: "active",
        category: categoryIds[3],
        productCode: "GTS-10P-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Yoga Mat Premium",
        description: "High-quality non-slip yoga mat for all fitness levels",
        price: 49.99,
        discount: 5,
        image: "yoga-mat-premium.jpg",
        status: "active",
        category: categoryIds[4],
        productCode: "YM-PREM-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Dumbbell Set",
        description: "Adjustable dumbbell set for home workouts",
        price: 199,
        discount: 20,
        image: "dumbbell-set.jpg",
        status: "active",
        category: categoryIds[4],
        productCode: "DB-ADJ-001",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Skincare Set",
        description: "Complete skincare routine with cleanser, serum, and moisturizer",
        price: 89.99,
        discount: 25,
        image: "skincare-set.jpg",
        status: "active",
        category: categoryIds[5],
        productCode: "SC-SET-001",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    const productResult = await productsCollection.insertMany(products);
    
    res.json({
      message: "Sample data populated successfully!",
      categoriesAdded: categoryResult.insertedCount,
      productsAdded: productResult.insertedCount,
      categoryIds: categoryIds.map(id => id.toString()),
      productIds: Object.values(productResult.insertedIds).map(id => id.toString())
    });
    
  } catch (error) {
    console.error('Populate error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;