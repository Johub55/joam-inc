import { Product } from '../types';

export const DEFAULT_PRODUCTS: Product[] = [
  // ==========================================
  // 🍔 BURGERS & WRAPS (Allemaal 'Werk', GEEN 'Mc')
  // ==========================================
  { id: 0, name: "✨ Bouw je Eigen WerkBurger", price: 6.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 1, name: "WerkPay Classic Burger", price: 6.25, salePrice: 3.95, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 2, name: "Double WerkBurger", price: 8.25, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 3, name: "Triple WerkBurger Extra Beef", price: 9.45, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 4, name: "Giga WerkBurger 4-Dubbel", price: 10.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 5, name: "WerkTasty Bacon & Cheese", price: 7.65, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 6, name: "Double WerkTasty Bacon", price: 9.15, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 7, name: "WerkPounder Royal", price: 6.45, salePrice: 4.25, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 8, name: "Double WerkPounder Royal", price: 7.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 9, name: "BBQ WerkRib Burger", price: 6.75, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🥩", inStock: true },
  { id: 10, name: "WerkChicken", price: 5.95, salePrice: 3.50, onSale: false, cat: "Burgers & Wraps", emoji: "🍗", inStock: true },
  { id: 11, name: "Spicy WerkChicken", price: 6.15, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🌶️", inStock: true },
  { id: 12, name: "Crispy WerkChicken Deluxe", price: 6.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍗", inStock: true },
  { id: 13, name: "WerkChicken Mozzarella & Bacon", price: 7.45, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍗", inStock: true },
  { id: 14, name: "WerkFish Burger Krokant", price: 5.45, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🐟", inStock: true },
  { id: 15, name: "Double WerkFish Deluxe", price: 6.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🐟", inStock: true },
  { id: 16, name: "WerkKroket Burger", price: 4.25, salePrice: 2.50, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 17, name: "Double WerkKroket Speciaal", price: 5.75, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 18, name: "Cheeseburger", price: 2.50, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🧀", inStock: true },
  { id: 19, name: "Double Cheeseburger", price: 4.25, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🧀", inStock: true },
  { id: 20, name: "Triple Cheeseburger", price: 5.45, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🧀", inStock: true },
  { id: 21, name: "Hamburger", price: 2.10, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 22, name: "WerkPlant Vegan Burger", price: 6.35, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🌱", inStock: true },
  { id: 23, name: "Double WerkPlant Vegan", price: 7.85, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🌱", inStock: true },
  { id: 24, name: "WerkMaster Angus Beef Burger", price: 8.50, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍔", inStock: true },
  { id: 25, name: "WerkBacon Cheese Deluxe", price: 6.85, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🥓", inStock: true },
  { id: 26, name: "WerkCrispy Onion BBQ Burger", price: 7.20, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🧅", inStock: true },
  { id: 27, name: "WerkTruffel & Parmezaan Burger", price: 7.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍄", inStock: true },
  { id: 28, name: "WerkJalapeño Smash Burger", price: 6.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🌶️", inStock: true },
  { id: 29, name: "WerkBoerenburger met Ei & Spek", price: 7.50, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🍳", inStock: true },
  { id: 30, name: "Chili Cheese WerkBurger", price: 5.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🧀", inStock: true },
  { id: 31, name: "Crispy WerkWrap Honing-Mosterd", price: 6.45, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🌯", inStock: true },
  { id: 32, name: "Crispy WerkWrap Sweet Chili", price: 6.45, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🌯", inStock: true },
  { id: 33, name: "Spicy WerkWrap Jalapeño", price: 6.65, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🌯", inStock: true },
  { id: 34, name: "WerkWrap Truffel Kip", price: 6.95, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🌯", inStock: true },
  { id: 35, name: "Veggie WerkWrap Avocado", price: 6.45, salePrice: 0, onSale: false, cat: "Burgers & Wraps", emoji: "🥑", inStock: true },

  // ==========================================
  // 🍗 CHICKEN & SNACKS
  // ==========================================
  { id: 36, name: "4 WerkNuggets", price: 3.95, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 37, name: "6 WerkNuggets", price: 5.35, salePrice: 3.25, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 38, name: "9 WerkNuggets", price: 6.95, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 39, name: "12 WerkNuggets Portie", price: 8.45, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 40, name: "20 WerkNuggets Deelbox", price: 11.95, salePrice: 8.95, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 41, name: "40 WerkNuggets Party Bucket", price: 21.50, salePrice: 17.50, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 42, name: "6 Spicy WerkNuggets", price: 5.65, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🌶️", inStock: true },
  { id: 43, name: "9 Spicy WerkNuggets", price: 7.25, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🌶️", inStock: true },
  { id: 44, name: "20 Spicy WerkNuggets Deelbox", price: 12.95, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🌶️", inStock: true },
  { id: 45, name: "WerkFamily ShareBox (20 Nuggets + 6 Tenders)", price: 17.50, salePrice: 14.50, onSale: false, cat: "Chicken & Snacks", emoji: "🎁", inStock: true },
  { id: 46, name: "Crispy WerkTenders 3st", price: 5.75, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 47, name: "Crispy WerkTenders 5st", price: 8.25, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 48, name: "Crispy WerkTenders Box 8st", price: 11.25, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 49, name: "Crispy WerkTenders Deelbox 12st", price: 15.95, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🍗", inStock: true },
  { id: 50, name: "WerkKaas Tops (Chili Cheese) 6st", price: 4.25, salePrice: 2.95, onSale: false, cat: "Chicken & Snacks", emoji: "🧀", inStock: true },
  { id: 51, name: "WerkKaas Tops (Chili Cheese) 9st", price: 5.95, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🧀", inStock: true },
  { id: 52, name: "WerkKaas Tops Emmer 15st", price: 8.95, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🧀", inStock: true },
  { id: 53, name: "Mozzarella WerkSticks 4st", price: 3.95, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🧀", inStock: true },
  { id: 54, name: "Mozzarella WerkSticks 8st", price: 6.75, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🧀", inStock: true },
  { id: 55, name: "Hot WerkWings 5st", price: 5.85, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🌶️", inStock: true },
  { id: 56, name: "Hot WerkWings 8st", price: 8.75, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🌶️", inStock: true },
  { id: 57, name: "Hot WerkWings Bucket 15st", price: 14.50, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🌶️", inStock: true },
  { id: 58, name: "WerkBitterballen Kalfsvlees 6st", price: 4.45, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🧆", inStock: true },
  { id: 59, name: "WerkKip Popcorn Beker", price: 4.25, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🍿", inStock: true },
  { id: 60, name: "Krokante Uienringen 8st", price: 3.95, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🧅", inStock: true },
  { id: 61, name: "Krokante Kaasstengels 6st", price: 4.35, salePrice: 0, onSale: false, cat: "Chicken & Snacks", emoji: "🧀", inStock: true },

  // ==========================================
  // 🍟 FRIET & SIDES
  // ==========================================
  { id: 62, name: "Kleine Franse WerkFriet", price: 2.85, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 63, name: "Medium Franse WerkFriet", price: 3.65, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 64, name: "Grote Franse WerkFriet", price: 4.15, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 65, name: "Twister WerkFriet (Krulfriet) Medium", price: 4.25, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 66, name: "Twister WerkFriet (Krulfriet) Groot", price: 4.85, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 67, name: "Zoete Aardappel WerkFriet", price: 4.75, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 68, name: "WerkFriet Oorlog (Saté + Mayo + Ui)", price: 4.65, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 69, name: "WerkFriet Truffel & Parmezaan", price: 4.95, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 70, name: "Loaded WerkFriet Cheddar & Bacon", price: 5.65, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 71, name: "Loaded WerkFriet Pulled Chicken BBQ", price: 5.95, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 72, name: "Boeren WerkFriet Mayo & Bieslook", price: 4.45, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍟", inStock: true },
  { id: 73, name: "WerkSalade Krokante Kip", price: 5.95, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🥗", inStock: true },
  { id: 74, name: "WerkSalade Caesar & Kaas", price: 5.75, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🥗", inStock: true },
  { id: 75, name: "Frisse Side Salad", price: 3.25, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🥗", inStock: true },
  { id: 76, name: "Appelpartjes Fris & Knapperig", price: 2.10, salePrice: 0, onSale: false, cat: "Friet & Sides", emoji: "🍏", inStock: true },

  // ==========================================
  // 🥤 KOUDE DRANKEN & WERKSHAKES (100% WERK, GEEN MCCAFÉ!)
  // ==========================================
  { id: 77, name: "Coca-Cola Zero", price: 3.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥤", inStock: true },
  { id: 78, name: "Coca-Cola Regular", price: 3.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥤", inStock: true },
  { id: 79, name: "Fanta Orange", price: 3.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥤", inStock: true },
  { id: 80, name: "Fanta Cassis", price: 3.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍇", inStock: true },
  { id: 81, name: "Sprite Zero", price: 3.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥤", inStock: true },
  { id: 82, name: "Fuze Tea Sparkling Black", price: 3.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥤", inStock: true },
  { id: 83, name: "Fuze Tea Green Tea", price: 3.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥤", inStock: true },
  { id: 84, name: "Fuze Tea Mango Chamomile", price: 3.45, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥤", inStock: true },
  { id: 85, name: "Fernandes Rood (Cherry Bouquet)", price: 3.25, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍒", inStock: true },
  { id: 86, name: "Fernandes Groen (Green Punch)", price: 3.25, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍈", inStock: true },
  { id: 87, name: "Spa Blauw Mineraalwater", price: 2.95, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "💧", inStock: true },
  { id: 88, name: "Spa Rood Bruiswater", price: 2.95, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "💧", inStock: true },
  { id: 89, name: "Verse Gekoelde Jus d'Orange", price: 3.75, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍊", inStock: true },
  { id: 90, name: "Chocomel Koud & Romig", price: 3.25, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍫", inStock: true },
  { id: 91, name: "Fristi Rood Fruit", price: 3.25, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍓", inStock: true },
  { id: 92, name: "WerkShake Aardbei", price: 4.10, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍓", inStock: true },
  { id: 93, name: "WerkShake Chocolade", price: 4.10, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍫", inStock: true },
  { id: 94, name: "WerkShake Vanille", price: 4.10, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥛", inStock: true },
  { id: 95, name: "WerkShake Banaan", price: 4.10, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍌", inStock: true },
  { id: 96, name: "WerkShake Karamel Zeezout", price: 4.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍮", inStock: true },
  { id: 97, name: "WerkShake Mango Passievrucht", price: 4.35, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🥭", inStock: true },
  { id: 98, name: "WerkShake Oreo Cookies & Cream", price: 4.50, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍪", inStock: true },
  { id: 99, name: "WerkShake Witte Chocolade & Bosbes", price: 4.50, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🫐", inStock: true },

  // ==========================================
  // 🍦 DESSERTS & IJS
  // ==========================================
  { id: 100, name: "WerkFlurry Oreo", price: 4.35, salePrice: 2.95, onSale: false, cat: "Desserts & IJs", emoji: "🍨", inStock: true },
  { id: 101, name: "WerkFlurry M&M's Choco", price: 4.35, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍦", inStock: true },
  { id: 102, name: "WerkFlurry Biscoff Lotus", price: 4.50, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍪", inStock: true },
  { id: 103, name: "WerkFlurry Stroopwafel & Kaneel", price: 4.50, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🧇", inStock: true },
  { id: 104, name: "WerkFlurry Karamel Crunch", price: 4.50, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍮", inStock: true },
  { id: 105, name: "WerkFlurry Witte Choco & Framboos", price: 4.60, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍓", inStock: true },
  { id: 106, name: "WerkFlurry Smarties Kleurenfeest", price: 4.40, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍬", inStock: true },
  { id: 107, name: "WerkFlurry Pistache & Witte Chocolade", price: 4.75, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🥜", inStock: true },
  { id: 108, name: "WerkSundae Aardbeiensaus", price: 3.60, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍓", inStock: true },
  { id: 109, name: "WerkSundae Warme Chocoladesaus", price: 3.60, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍫", inStock: true },
  { id: 110, name: "WerkSundae Warme Karamelsaus", price: 3.60, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍮", inStock: true },
  { id: 111, name: "WerkSundae Pistache Crunch", price: 3.85, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🥜", inStock: true },
  { id: 112, name: "Warme Werk Apple Pie", price: 2.20, salePrice: 1.50, onSale: false, cat: "Desserts & IJs", emoji: "🥧", inStock: true },
  { id: 113, name: "Warme Werk Choco Pie", price: 2.40, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍫", inStock: true },
  { id: 114, name: "Warme Werk Kersen Pie", price: 2.40, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍒", inStock: true },
  { id: 115, name: "Werk Softijs Hoorntje", price: 1.95, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍦", inStock: true },
  { id: 116, name: "Werk Softijs Dip Chocolade", price: 2.35, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍦", inStock: true },
  { id: 117, name: "WerkDonut Roze Glazuur", price: 2.25, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍩", inStock: true },
  { id: 118, name: "WerkDonut Choco Hazelnoot", price: 2.45, salePrice: 0, onSale: false, cat: "Desserts & IJs", emoji: "🍩", inStock: true },

  // ==========================================
  // 🎁 WERKMEAL KIDS (100% WERK, GEEN HAPPY MEAL!)
  // ==========================================
  { id: 119, name: "WerkMeal Hamburger Menu", price: 5.95, salePrice: 0, onSale: false, cat: "WerkMeal Kids", emoji: "🎁", inStock: true },
  { id: 120, name: "WerkMeal Cheeseburger Menu", price: 5.95, salePrice: 0, onSale: false, cat: "WerkMeal Kids", emoji: "🎁", inStock: true },
  { id: 121, name: "WerkMeal 4 WerkNuggets Menu", price: 5.95, salePrice: 0, onSale: false, cat: "WerkMeal Kids", emoji: "🎁", inStock: true },
  { id: 122, name: "WerkMeal Krokante Kip Burger Menu", price: 5.95, salePrice: 0, onSale: false, cat: "WerkMeal Kids", emoji: "🎁", inStock: true },
  { id: 123, name: "WerkMeal Mini WerkWrap Menu", price: 5.95, salePrice: 0, onSale: false, cat: "WerkMeal Kids", emoji: "🎁", inStock: true },
  { id: 124, name: "WerkMeal Visburger Menu", price: 5.95, salePrice: 0, onSale: false, cat: "WerkMeal Kids", emoji: "🎁", inStock: true },
  { id: 125, name: "WerkMeal Mini Pannenkoekjes (6st)", price: 5.95, salePrice: 0, onSale: false, cat: "WerkMeal Kids", emoji: "🥞", inStock: true },

  // ==========================================
  // 🥫 SAUZEN & WERKDIPS
  // ==========================================
  { id: 126, name: "WerkFritessaus Romig", price: 0.80, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 127, name: "Echte Zaanse Mayonaise", price: 0.80, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 128, name: "WerkSaus Signature Dip", price: 0.90, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 129, name: "Zoetzure Saus", price: 0.80, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 130, name: "Smokey Barbecue Saus", price: 0.80, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 131, name: "Curry Gewürz Saus", price: 0.80, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 132, name: "WerkChili Sweet & Hot Saus", price: 0.85, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 133, name: "Honing-Mosterd Dip", price: 0.85, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 134, name: "Truffel Mayonaise Dip", price: 0.95, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 135, name: "Samurai Pittige Saus", price: 0.85, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 136, name: "Knoflook-Kruiden Saus", price: 0.85, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 137, name: "Warme Satésaus", price: 1.10, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥜", inStock: true },
  { id: 138, name: "Classic Heinz Ketchup", price: 0.80, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 139, name: "Belgische Mayonaise", price: 0.80, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },
  { id: 140, name: "Joppiesaus Echte Smaak", price: 0.85, salePrice: 0, onSale: false, cat: "Sauzen & WerkDips", emoji: "🥫", inStock: true },

  // ==========================================
  // ⚡ EXTRA KOUDE DRANKEN & ENERGY
  // ==========================================
  { id: 141, name: "Red Bull Energy Drink (250ml)", price: 3.75, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "⚡", inStock: true },
  { id: 142, name: "Red Bull Sugarfree (250ml)", price: 3.75, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "⚡", inStock: true },
  { id: 143, name: "Monster Energy Original (500ml)", price: 3.95, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "⚡", inStock: true },
  { id: 144, name: "Chaudfontaine Rood Bruiswater", price: 2.95, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "💧", inStock: true },
  { id: 145, name: "Chaudfontaine Blauw Platwater", price: 2.95, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "💧", inStock: true },
  { id: 146, name: "Biologische Appelsap Fles", price: 3.25, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🍏", inStock: true },
  { id: 147, name: "IJskoffie Karamel Macchiato", price: 3.95, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🧋", inStock: true },
  { id: 148, name: "IJskoffie Vanille Frappé", price: 3.95, salePrice: 0, onSale: false, cat: "Koude Dranken & WerkShakes", emoji: "🧋", inStock: true },

  // ==========================================
  // ☕ WARME DRANKEN & KOFFIE
  // ==========================================
  { id: 149, name: "Warme WerkKoffie Vers Gemalen", price: 2.65, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "☕", inStock: true },
  { id: 150, name: "Cappuccino Romig Melkschuim", price: 3.25, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "☕", inStock: true },
  { id: 151, name: "Latte Macchiato Lagen", price: 3.65, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "☕", inStock: true },
  { id: 152, name: "Espresso Krachtig", price: 2.35, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "☕", inStock: true },
  { id: 153, name: "Warme WerkChocomel met Slagroom", price: 3.45, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "🍫", inStock: true },
  { id: 154, name: "Verse Muntthee met Honing", price: 3.25, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "🍵", inStock: true },
  { id: 155, name: "Earl Grey Bloemige Thee", price: 2.65, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "🫖", inStock: true }
];

// ==============================================================================
// 🧇 DE KOEKPLOEG - AMBACHTELIJKE STROOPWAFELS, KOEKEN & BAKKERIJ MENUKAART
// ==============================================================================
export const KOEKPLOEG_PRODUCTS: Product[] = [
  // 🧇 STROOPWAFELS & SPECIALS
  { id: 201, name: "Verse Warme Goudse Stroopwafel (Original)", price: 2.50, salePrice: 0, onSale: false, cat: "Stroopwafels & Specials", emoji: "🧇", inStock: true },
  { id: 202, name: "Mega Stroopwafel XL Karamel-Zeezout", price: 3.75, salePrice: 2.95, onSale: true, cat: "Stroopwafels & Specials", emoji: "🧇", inStock: true },
  { id: 203, name: "Stroopwafel met Belgische Melkchocolade", price: 3.45, salePrice: 0, onSale: false, cat: "Stroopwafels & Specials", emoji: "🍫", inStock: true },
  { id: 204, name: "Stroopwafel Pure Chocolade & Hazelnoot", price: 3.65, salePrice: 0, onSale: false, cat: "Stroopwafels & Specials", emoji: "🍫", inStock: true },
  { id: 205, name: "Stroopwafel Witte Chocolade & Smarties", price: 3.75, salePrice: 0, onSale: false, cat: "Stroopwafels & Specials", emoji: "🧇", inStock: true },
  { id: 206, name: "Verse Stroopwafel Kruimelzak (Warm & Krokant)", price: 2.00, salePrice: 0, onSale: false, cat: "Stroopwafels & Specials", emoji: "🧇", inStock: true },
  { id: 207, name: "Stroopwafel Kruimelzak met Warme Stroop Shot", price: 2.75, salePrice: 0, onSale: false, cat: "Stroopwafels & Specials", emoji: "🍯", inStock: true },
  { id: 208, name: "Stroopwafel Tosti met Karamel & Banaan", price: 4.50, salePrice: 0, onSale: false, cat: "Stroopwafels & Specials", emoji: "🍌", inStock: true },
  { id: 209, name: "Mini Stroopwafeltjes Beker (12st)", price: 3.50, salePrice: 0, onSale: false, cat: "Stroopwafels & Specials", emoji: "🧇", inStock: true },

  // 🥮 LUXE HOLLANDSE KOEKEN & GEBAK
  { id: 210, name: "Ambachtelijke Gevulde Koek (100% Amandelspijs)", price: 2.25, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🥮", inStock: true },
  { id: 211, name: "Double Gevulde Amandelkoek XL", price: 3.10, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🥮", inStock: true },
  { id: 212, name: "Klassieke Roze Glazuurkoek", price: 1.95, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🌸", inStock: true },
  { id: 213, name: "Goudbruine Bakkers Kano met Spijs", price: 2.10, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🛶", inStock: true },
  { id: 214, name: "Gevuld Speculaas Blok met Amandelen", price: 2.65, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🪵", inStock: true },
  { id: 215, name: "Oma's Warme Appeltaart Punt met Kaneel", price: 3.95, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🥧", inStock: true },
  { id: 216, name: "Warme Appeltaart Punt met Echte Slagroom", price: 4.50, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🥧", inStock: true },
  { id: 217, name: "Romige Boterkoek Punt met Citroenrasp", price: 2.20, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🥮", inStock: true },
  { id: 218, name: "Echte Bossche Bol met Slagroom & Chocolade", price: 3.85, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🍫", inStock: true },
  { id: 219, name: "Krakelingen Roomboter (Zakje 6st)", price: 2.80, salePrice: 0, onSale: false, cat: "Luxe Hollandse Koeken", emoji: "🥨", inStock: true },

  // 🍪 KOEK BITES & CHOCOLADE
  { id: 220, name: "Chocolade Bokkenpootjes (Portie 4st)", price: 2.95, salePrice: 0, onSale: false, cat: "Koek Bites & Chocolade", emoji: "🐐", inStock: true },
  { id: 221, name: "Warme Chocolate Chip Cookie", price: 2.50, salePrice: 0, onSale: false, cat: "Koek Bites & Chocolade", emoji: "🍪", inStock: true },
  { id: 222, name: "Triple Dark Chocolate Fudge Cookie", price: 2.75, salePrice: 0, onSale: false, cat: "Koek Bites & Chocolade", emoji: "🍪", inStock: true },
  { id: 223, name: "Red Velvet White Chocolate Cookie", price: 2.75, salePrice: 0, onSale: false, cat: "Koek Bites & Chocolade", emoji: "🍪", inStock: true },
  { id: 224, name: "Krokante Kletskoppen Buidel", price: 2.35, salePrice: 0, onSale: false, cat: "Koek Bites & Chocolade", emoji: "🥨", inStock: true },
  { id: 225, name: "Karamel Kokosmakronen (2st)", price: 2.45, salePrice: 0, onSale: false, cat: "Koek Bites & Chocolade", emoji: "🥥", inStock: true },

  // ☕ WARME DRANKEN & BAKKERS KOFFIE
  { id: 226, name: "Koekploeg Koffie Compleet (+ Mini Stroopwafel)", price: 3.25, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "☕", inStock: true },
  { id: 227, name: "Romige Cappuccino met Kaneelstroop", price: 3.65, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "☕", inStock: true },
  { id: 228, name: "Latte Macchiato Karamel & Kruimels", price: 4.10, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "☕", inStock: true },
  { id: 229, name: "Warme Chocomel met Slagroom & Karamel", price: 3.85, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "🍫", inStock: true },
  { id: 230, name: "Verse Muntthee met Honing & Mini Koek", price: 3.20, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "🍵", inStock: true },
  { id: 231, name: "Verse Gember-Citroenthee", price: 3.20, salePrice: 0, onSale: false, cat: "Warme Dranken & Koffie", emoji: "🫖", inStock: true },

  // 🍦 IJS & STROOPWAFEL SPECIALS
  { id: 232, name: "Stroopwafel Softijs Sundae met Karamel", price: 3.50, salePrice: 0, onSale: false, cat: "IJs & Specials", emoji: "🍦", inStock: true },
  { id: 233, name: "KoekFlurry Stroopwafel Crunch", price: 3.95, salePrice: 0, onSale: false, cat: "IJs & Specials", emoji: "🍦", inStock: true },
  { id: 234, name: "KoekFlurry Gevulde Koek & Amandel", price: 3.95, salePrice: 0, onSale: false, cat: "IJs & Specials", emoji: "🍦", inStock: true },
  { id: 235, name: "Warme Stroopwafel met Bol Vanille-ijs", price: 4.95, salePrice: 0, onSale: false, cat: "IJs & Specials", emoji: "🍨", inStock: true },
  { id: 236, name: "Stroopwafel Milkshake Karamel (Medium)", price: 4.25, salePrice: 0, onSale: false, cat: "IJs & Specials", emoji: "🥤", inStock: true },
  { id: 237, name: "Stroopwafel Milkshake Karamel (Groot)", price: 4.95, salePrice: 0, onSale: false, cat: "IJs & Specials", emoji: "🥤", inStock: true },

  // 🎁 VOORDEEL & CADEAU BLIKKEN
  { id: 238, name: "Koekploeg Bewaarblik (10 Verse Koeken Assorti)", price: 14.95, salePrice: 12.50, onSale: true, cat: "Voordeel & Cadeaus", emoji: "🎁", inStock: true },
  { id: 239, name: "Stroopwafel Cadeaupakket met Karamel Likeur", price: 18.50, salePrice: 0, onSale: false, cat: "Voordeel & Cadeaus", emoji: "🎁", inStock: true },
  { id: 240, name: "Koekploeg Familiebox (4 Stroopwafels + 4 Koeken)", price: 16.00, salePrice: 13.50, onSale: true, cat: "Voordeel & Cadeaus", emoji: "📦", inStock: true }
];

export const ALL_DEFAULT_PRODUCTS: Product[] = [
  ...DEFAULT_PRODUCTS,
  ...KOEKPLOEG_PRODUCTS
];
