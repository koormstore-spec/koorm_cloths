// Generates the import manifest from the supplied photography folders.
const fs = require('fs');
const path = require('path');
const source = process.argv[2];
if (!source) throw new Error('Usage: node utils/prepareCollection.cjs <photo folder>');
const entries = [
  ['100% linen_light_pink', 'Light Pink Linen Shirt', 'Light Pink', '100% linen'],
  ['Aqua Blue Printed Shirt_100%_EROPIAN_Linen', 'Aqua Blue Printed Linen Shirt', 'Aqua Blue', '100% European linen'],
  ['Black Micro Print Shirt_cotton_100%', 'Black Micro Print Cotton Shirt', 'Black', '100% cotton'],
  ['Blush Check_cotton', 'Blush Check Cotton Shirt', 'Blush Pink', 'cotton'],
  ['Burgundy Checked Shirt_twill', 'Burgundy Check Twill Shirt', 'Burgundy', 'twill'],
  ['Charcoal Check_twill_cotton_check', 'Charcoal Check Cotton Twill Shirt', 'Charcoal', 'cotton twill'],
  ['Charcoal Grey Shirt_oxford_shirts', 'Charcoal Grey Oxford Shirt', 'Charcoal Grey', 'Oxford weave'],
  ['cotton_linen_Light Blue Striped Shirt', 'Light Blue Stripe Cotton Linen Shirt', 'Light Blue', 'cotton linen blend'],
  ['cotton_linen_Royal Blue Shirt', 'Royal Blue Cotton Linen Shirt', 'Royal Blue', 'cotton linen blend'],
  ['Dark Chocolate Brown_100%_cotton', 'Chocolate Brown Cotton Shirt', 'Chocolate Brown', '100% cotton'],
  ['dark_navy_100%_cotton', 'Dark Navy Cotton Shirt', 'Dark Navy', '100% cotton'],
  ['Eurp_100_{Rust_color}', 'Rust European Linen Shirt', 'Rust', '100% European linen'],
  ['light Pink Printed Shirt_cotton', 'Light Pink Printed Cotton Shirt', 'Light Pink', 'cotton'],
  ['Monochrome Check_100%_cotton', 'Monochrome Check Cotton Shirt', 'Black & White', '100% cotton'],
  ['musturd_twill_checks', 'Mustard Check Twill Shirt', 'Mustard', 'twill'],
  ['off-white_twill_checks', 'Off White Check Twill Shirt', 'Off White', 'twill'],
  ['olive_green_linen_100%_EUROPIAN', 'Olive Green European Linen Shirt', 'Olive Green', '100% European linen'],
  ['olive_green_twill_checks', 'Olive Green Check Twill Shirt', 'Olive Green', 'twill'],
  ['Petrol Blue_twill_check_shirt', 'Petrol Blue Check Twill Shirt', 'Petrol Blue', 'twill'],
  ['rust_oxford_shirt', 'Rust Oxford Shirt', 'Rust', 'Oxford weave'],
  ['Sand Beige_linen_100%', 'Sand Beige Linen Shirt', 'Sand Beige', '100% linen'],
  ['Twill_checks_cheery_color', 'Cherry Check Twill Shirt', 'Cherry', 'twill'],
  ['twill_check_ Rust Orange', 'Rust Orange Check Twill Shirt', 'Rust Orange', 'twill'],
  ['White Grey Stripe cotton', 'White Grey Stripe Cotton Shirt', 'White & Grey', 'cotton'],
  ['white_grey_100%_cotton', 'White Grey Cotton Shirt', 'White & Grey', '100% cotton'],
];
const folders = fs.readdirSync(source, { withFileTypes: true }).filter(e => e.isDirectory());
if (folders.length !== entries.length) throw new Error('Unexpected product folders; review the manifest.');
const products = entries.map(([folder, name, color, fabric]) => {
  const files = fs.readdirSync(path.join(source, folder)).filter(file => /\.jpe?g$/i.test(file)).sort();
  if (files.length !== 6) throw new Error(`Expected six photos for ${folder}`);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    source_folder: folder, source_files: files, name, slug,
    description: `${name} in ${fabric}. A ${color.toLowerCase()} addition to the Koorm collection, easy to pair with your everyday wardrobe. Explore all six photographs for a closer look at the fabric and styling.`,
    price: 2499, discount_price: 1874.25, brand: 'Koorm', gender: 'men',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: [color],
    images: files.map((_, index) => `/images/collection-26/${slug}/${index + 1}.jpg`),
    stock: 0, rating: 0, num_reviews: 0,
    is_featured: /European Linen|Oxford|Petrol Blue|Blush Check/.test(name) ? 1 : 0,
  };
});
const destination = path.join(__dirname, '../data/collection-26.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify({
  note: 'Replacement collection. Price and S–XXL sizes are temporary defaults; stock is zero pending confirmation. A 25% product discount is applied. No invented reviews.',
  products,
}, null, 2) + '\n');
console.log(`Prepared ${products.length} products and ${products.reduce((n, p) => n + p.images.length, 0)} photos.`);
