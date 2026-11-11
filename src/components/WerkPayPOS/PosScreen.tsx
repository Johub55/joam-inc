import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { euro, ORDER_KIOSK_USER } from '../../services/store';
import { Product, CartItem } from '../../types';
import { PosLoginModal } from './PosLoginModal';
import { LoyaltyQuickPopup } from './LoyaltyQuickPopup';
import { GiftCardModal } from './GiftCardModal';
import { 
  ALL_SAUCES, 
  ALL_MENU_DRINKS, 
  ALL_MENU_SIDES, 
  KIDS_TOYS, 
  KIDS_DRINKS, 
  KIDS_SIDES, 
  KIDS_SAUCES,
  SauceOption,
  DrinkOption,
  SideOption
} from '../../services/customizationData';
import { getIncludedSauceCount } from '../../services/orderStatus';
import { 
  Search, 
  Plus, 
  Sparkles, 
  Minus, 
  Trash2, 
  UtensilsCrossed, 
  Tag, 
  Check, 
  X,
  CreditCard,
  AlertTriangle,
  AlertCircle,
  Flame,
  CheckCircle2,
  RefreshCw,
  ShoppingBag,
  Lock,
  ShieldCheck,
  Gift
} from 'lucide-react';
import { showToast } from '../../services/appToast';

interface PosScreenProps {
  onOpenPaymentModal: () => void;
}

export const PosScreen: React.FC<PosScreenProps> = ({ onOpenPaymentModal }) => {
  const {
    products,
    brandProducts,
    activeBrand,
    brandConfig,
    resetProductsToDefault,
    cart,
    addToCart,
    updateCartQty,
    setCartItemQty,
    removeFromCart,
    emptyCart,
    orderNo,
    orderStopActive,
    orderStopText,
    orderStopConfig,
    appliedDiscount,
    customBranding,
    managerOverride,
    applyCouponCode,
    removeCoupon,
    coupons,
    currentPosUser,
    setCurrentPosUser,
    verifyMasterPin
  } = useApp();

  const isKoekploeg = activeBrand === 'koekploeg';
  
  const effectiveBranding = customBranding.useCustomBranding ? {
    name: customBranding.storeName,
    tagline: customBranding.tagline,
    emoji: customBranding.logoEmoji,
    gradient: customBranding.headerGradient,
    color: customBranding.primaryColor
  } : {
    name: brandConfig.name,
    tagline: brandConfig.tagline,
    emoji: brandConfig.logoEmoji,
    gradient: isKoekploeg ? 'from-amber-600 via-amber-500 to-yellow-400' : 'from-rose-600 via-red-500 to-orange-400',
    color: isKoekploeg ? '#f59e0b' : '#e11d48'
  };

  const displayProducts = brandProducts && brandProducts.length > 0 ? brandProducts : products;

  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showLoyaltyPopup, setShowLoyaltyPopup] = useState<boolean>(false);
  const [showGiftCardModal, setShowGiftCardModal] = useState<boolean>(false);
  const [selectedCat, setSelectedCat] = useState<string>('Alles');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [managerBypass, setManagerBypass] = useState<boolean>(false);
  
  // Custom item (Handmatig bedrag) modal
  const [showCustomItemModal, setShowCustomItemModal] = useState<boolean>(false);
  const [customItemName, setCustomItemName] = useState<string>('Toeslag / Extra item');
  const [customItemPrice, setCustomItemPrice] = useState<string>('');

  // Kiosk Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [kioskMenuSize, setKioskMenuSize] = useState<'single' | 'medium' | 'large'>('single');
  const [kioskSide, setKioskSide] = useState<SideOption>(ALL_MENU_SIDES[0]);
  const [kioskDrink, setKioskDrink] = useState<DrinkOption>(ALL_MENU_DRINKS[0]);
  const [kioskDrinkFilter, setKioskDrinkFilter] = useState<'alle' | 'fris' | 'shakes' | 'koffie' | 'energy_sap'>('alle');
  const [kioskDrinkLemon, setKioskDrinkLemon] = useState<boolean>(false);
  const [kioskDrinkIce, setKioskDrinkIce] = useState<'normaal' | 'zonder' | 'extra'>('normaal');
  const [kioskDrinkStraw, setKioskDrinkStraw] = useState<boolean>(true);

  // Sauces in menu
  const [kioskMenuSauce, setKioskMenuSauce] = useState<SauceOption>(ALL_SAUCES[0]);
  const [kioskMenuSecondSauce, setKioskMenuSecondSauce] = useState<SauceOption | null>(null);

  // Snacks dipping sauces
  const [kioskSnackSauce1, setKioskSnackSauce1] = useState<SauceOption>(ALL_SAUCES[5]); // Zoetzure Saus
  const [kioskSnackSauce2, setKioskSnackSauce2] = useState<SauceOption>(ALL_SAUCES[0]); // WerkFritessaus
  const [kioskSnackSauce3, setKioskSnackSauce3] = useState<SauceOption>(ALL_SAUCES[4]); // WerkSaus Signature
  const [kioskSnackSauce4, setKioskSnackSauce4] = useState<SauceOption>(ALL_SAUCES[6]); // BBQ
  const [kioskSnackExtraSauce, setKioskSnackExtraSauce] = useState<SauceOption | null>(null);
  const [kioskSnackPreparation, setKioskSnackPreparation] = useState<'normaal' | 'krokant'>('normaal');

  const snackFreeSauceCount = useMemo(() => {
    if (!selectedProduct) return 3;
    return Math.max(3, getIncludedSauceCount(selectedProduct.name, selectedProduct.cat));
  }, [selectedProduct]);

  // Burger Customizations
  const [kioskBurgerBun, setKioskBurgerBun] = useState<'sesam' | 'brioche' | 'glutenvrij'>('sesam');
  const [kioskBurgerSauce, setKioskBurgerSauce] = useState<'normaal' | 'zonder' | 'extra' | 'dubbel' | 'apart'>('normaal');
  const [kioskCustoms, setKioskCustoms] = useState<{
    onion: 'normaal' | 'zonder' | 'extra' | 'gebakken';
    pickle: 'normaal' | 'zonder' | 'extra';
    cheese: 'normaal' | 'zonder' | 'extra' | 'dubbel';
    lettuce: 'normaal' | 'zonder' | 'extra';
    tomato: 'normaal' | 'zonder' | 'extra';
    bacon: 'geen' | 'toevoegen' | 'dubbel';
    jalapenos: 'geen' | 'toevoegen';
    extraPatty: 'geen' | 'rundvlees' | 'kip';
  }>({
    onion: 'normaal',
    pickle: 'normaal',
    cheese: 'normaal',
    lettuce: 'normaal',
    tomato: 'normaal',
    bacon: 'geen',
    jalapenos: 'geen',
    extraPatty: 'geen'
  });

  // Direct Drink selection (when clicked as standalone product)
  const [directDrinkSize, setDirectDrinkSize] = useState<'klein' | 'medium' | 'groot'>('klein');
  const [directDrinkLemon, setDirectDrinkLemon] = useState<boolean>(false);
  const [directDrinkIce, setDirectDrinkIce] = useState<'normaal' | 'zonder' | 'extra'>('normaal');
  const [directDrinkStraw, setDirectDrinkStraw] = useState<boolean>(true);
  const [directDrinkSyrup, setDirectDrinkSyrup] = useState<'geen' | 'slagroom' | 'karamel' | 'vanille' | 'espresso'>('geen');

  // Direct Sides selection
  const [directSideSize, setDirectSideSize] = useState<'klein' | 'medium' | 'groot'>('medium');
  const [directSideSauce, setDirectSideSauce] = useState<SauceOption | null>(ALL_SAUCES[0]);
  const [directSideSecondSauce, setDirectSideSecondSauce] = useState<SauceOption | null>(null);
  const [directSideSalt, setDirectSideSalt] = useState<'normaal' | 'zoutloos' | 'extra'>('normaal');

  // WerkMeal Kids
  const [kioskToy, setKioskToy] = useState<string>(KIDS_TOYS[0]);
  const [kioskKidsSide, setKioskKidsSide] = useState<string>(KIDS_SIDES[0]);
  const [kioskKidsDrink, setKioskKidsDrink] = useState<string>(KIDS_DRINKS[0]);
  const [kioskKidsSauce, setKioskKidsSauce] = useState<string>(KIDS_SAUCES[0]);

  // Desserts
  const [kioskDessertSauce, setKioskDessertSauce] = useState<'geen' | 'warme_choco' | 'warme_karamel' | 'aardbei'>('geen');
  const [kioskDessertExtra, setKioskDessertExtra] = useState<'geen' | 'oreo' | 'mm' | 'stroopwafel' | 'slagroom'>('geen');

  const [kioskSpecialNote, setKioskSpecialNote] = useState<string>('');
  const [kioskQty, setKioskQty] = useState<number>(1);

  // Burger Builder State
  const [showBuilderModal, setShowBuilderModal] = useState<boolean>(false);
  const [builderBun, setBuilderBun] = useState<{ name: string; extra: number }>({ name: 'Sesambroodje', extra: 0 });
  const [builderPatty, setBuilderPatty] = useState<{ name: string; extra: number }>({ name: '100% Rundvlees', extra: 0 });
  const [builderSauce, setBuilderSauce] = useState<{ name: string; extra: number }>({ name: 'Special Saus', extra: 0 });
  const [builderSecondSauce, setBuilderSecondSauce] = useState<{ name: string; extra: number } | null>(null);
  const [builderToppings, setBuilderToppings] = useState<{ [key: string]: boolean }>({
    bacon: false,
    extraCheddar: false,
    jalapenos: false,
    friedOnions: false,
    tomato: false,
    lettuce: false,
    pickle: false,
    friedEgg: false
  });

  // Coupons input
  const [typedCoupon, setTypedCoupon] = useState<string>('');
  const [couponFeedback, setCouponFeedback] = useState<string>('');

  // Categories list
  const categories = useMemo(() => {
    const cats = ['Alles', ...Array.from(new Set(displayProducts.map(p => p.cat)))];
    return cats;
  }, [displayProducts]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return displayProducts.filter(p => {
      const matchCat = selectedCat === 'Alles' || p.cat === selectedCat;
      const matchQuery = !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [displayProducts, selectedCat, searchQuery]);

  // Filtered drinks for menu selection
  const filteredMenuDrinks = useMemo(() => {
    if (kioskDrinkFilter === 'alle') return ALL_MENU_DRINKS;
    return ALL_MENU_DRINKS.filter(d => d.category === kioskDrinkFilter);
  }, [kioskDrinkFilter]);

  // Cart calculations
  const rawSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    if (appliedDiscount.type === 'percent') {
      return rawSubtotal * (appliedDiscount.val / 100);
    }
    if (appliedDiscount.type === 'fixed' || appliedDiscount.type === 'threshold') {
      return Math.min(rawSubtotal, appliedDiscount.val);
    }
    return 0;
  }, [rawSubtotal, appliedDiscount]);

  const finalTotal = Math.max(0, rawSubtotal - discountAmount);

  // Surprise Me Handler
  const handleSurpriseMe = () => {
    if (orderStopActive && !currentPosUser?.is_admin) {
      showToast('Bestellingen zijn momenteel gepauzeerd door de bestelstop.', 'warning');
      return;
    }
    const available = products.filter(p => p.inStock && p.name !== '✨ Bouw je Eigen Burger');
    if (available.length === 0) return;
    const randomP = available[Math.floor(Math.random() * available.length)];
    openKiosk(randomP);
  };

  // Open Kiosk modal
  const openKiosk = (p: Product) => {
    if (orderStopActive && !currentPosUser?.is_admin) {
      showToast('Bestellingen zijn momenteel gepauzeerd door de bestelstop.', 'warning');
      return;
    }
    if (!p.inStock) return;
    if (p.name.includes('Bouw je Eigen')) {
      setShowBuilderModal(true);
      return;
    }
    setSelectedProduct(p);
    setKioskMenuSize('single');
    setKioskSide(ALL_MENU_SIDES[0]);
    setKioskDrink(ALL_MENU_DRINKS[0]);
    setKioskDrinkFilter('alle');
    setKioskDrinkLemon(false);
    setKioskDrinkIce('normaal');
    setKioskDrinkStraw(true);
    setKioskMenuSauce(ALL_SAUCES[0]);
    setKioskMenuSecondSauce(null);

    setKioskSnackSauce1(ALL_SAUCES[5]); // Zoetzure Saus
    setKioskSnackSauce2(ALL_SAUCES[0]); // WerkFritessaus
    setKioskSnackSauce3(ALL_SAUCES[4]); // WerkSaus Signature
    setKioskSnackSauce4(ALL_SAUCES[6]); // Smokey BBQ
    setKioskSnackExtraSauce(null);
    setKioskSnackPreparation('normaal');

    setKioskBurgerBun('sesam');
    setKioskBurgerSauce('normaal');
    setKioskCustoms({
      onion: 'normaal',
      pickle: 'normaal',
      cheese: 'normaal',
      lettuce: 'normaal',
      tomato: 'normaal',
      bacon: 'geen',
      jalapenos: 'geen',
      extraPatty: 'geen'
    });

    setDirectDrinkSize('klein');
    setDirectDrinkLemon(false);
    setDirectDrinkIce('normaal');
    setDirectDrinkStraw(true);
    setDirectDrinkSyrup('geen');

    setDirectSideSize('medium');
    setDirectSideSauce(ALL_SAUCES[0]);
    setDirectSideSecondSauce(null);
    setDirectSideSalt('normaal');

    setKioskToy(KIDS_TOYS[0]);
    setKioskKidsSide(KIDS_SIDES[0]);
    setKioskKidsDrink(KIDS_DRINKS[0]);
    setKioskKidsSauce(KIDS_SAUCES[0]);

    setKioskDessertSauce('geen');
    setKioskDessertExtra('geen');

    setKioskSpecialNote('');
    setKioskQty(1);
  };

  // Calculate price for kiosk selection
  const singleKioskPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    let base = selectedProduct.onSale && selectedProduct.salePrice > 0 ? selectedProduct.salePrice : selectedProduct.price;
    const cat = selectedProduct.cat;

    // 1. Burgers & Wraps
    if (cat === 'Burgers & Wraps') {
      if (kioskMenuSize === 'medium') base += 4.70;
      if (kioskMenuSize === 'large') base += 5.40;
      if (kioskMenuSize !== 'single') {
        base += kioskSide.extra + kioskDrink.extra;
        base += kioskMenuSauce.extraMenu;
        if (kioskMenuSecondSauce) base += 0.80;
        if (kioskDrinkLemon) base += 0.15;
      }
      if (kioskBurgerBun === 'brioche') base += 0.60;
      if (kioskBurgerBun === 'glutenvrij') base += 0.80;
      if (kioskBurgerSauce === 'extra') base += 0.30;
      if (kioskBurgerSauce === 'dubbel') base += 0.50;
      if (kioskBurgerSauce === 'apart') base += 0.40;
      if (kioskCustoms.onion === 'extra') base += 0.30;
      if (kioskCustoms.onion === 'gebakken') base += 0.40;
      if (kioskCustoms.pickle === 'extra') base += 0.30;
      if (kioskCustoms.cheese === 'extra') base += 0.60;
      if (kioskCustoms.cheese === 'dubbel') base += 1.10;
      if (kioskCustoms.lettuce === 'extra') base += 0.20;
      if (kioskCustoms.tomato === 'extra') base += 0.30;
      if (kioskCustoms.bacon === 'toevoegen') base += 0.80;
      if (kioskCustoms.bacon === 'dubbel') base += 1.50;
      if (kioskCustoms.jalapenos === 'toevoegen') base += 0.30;
      if (kioskCustoms.extraPatty === 'rundvlees' || kioskCustoms.extraPatty === 'kip') base += 1.80;
    }

    // 2. Chicken & Snacks
    else if (cat === 'Chicken & Snacks') {
      if (kioskMenuSize === 'medium') base += 4.70;
      if (kioskMenuSize === 'large') base += 5.40;
      if (kioskMenuSize !== 'single') {
        base += kioskSide.extra + kioskDrink.extra;
        base += kioskMenuSauce.extraMenu;
        if (kioskMenuSecondSauce) base += 0.80;
        if (kioskDrinkLemon) base += 0.15;
      }
      // Free sauces up to snackFreeSauceCount are included for free
      if (kioskSnackExtraSauce) base += 0.80;
    }

    // 3. Koude Dranken & WerkShakes or Warme Dranken & Koffie
    else if (cat === 'Koude Dranken & WerkShakes' || cat === 'Warme Dranken & Koffie') {
      if (directDrinkSize === 'medium') base += 0.60;
      if (directDrinkSize === 'groot') base += 1.10;
      if (directDrinkLemon) base += 0.15;
      if (directDrinkSyrup === 'slagroom') base += 0.50;
      if (directDrinkSyrup === 'karamel' || directDrinkSyrup === 'vanille') base += 0.40;
      if (directDrinkSyrup === 'espresso') base += 0.70;
    }

    // 4. Friet & Sides
    else if (cat === 'Friet & Sides') {
      const lowerName = selectedProduct.name.toLowerCase();
      if (lowerName.includes('friet') && !lowerName.includes('klein') && !lowerName.includes('medium') && !lowerName.includes('groot')) {
        if (directSideSize === 'medium') base += 0.70;
        if (directSideSize === 'groot') base += 1.20;
      }
      if (directSideSauce) base += directSideSauce.extraSingle;
      if (directSideSecondSauce) base += directSideSecondSauce.extraSingle;
    }

    // 5. Desserts & IJs
    else if (cat === 'Desserts & IJs') {
      if (kioskDessertSauce !== 'geen') base += 0.60;
      if (kioskDessertExtra !== 'geen') base += 0.50;
    }

    return base;
  }, [
    selectedProduct,
    kioskMenuSize,
    kioskSide,
    kioskDrink,
    kioskDrinkIce,
    kioskMenuSauce,
    kioskMenuSecondSauce,
    kioskSnackSauce2,
    kioskBurgerBun,
    kioskBurgerSauce,
    kioskCustoms,
    directDrinkSize,
    directDrinkIce,
    directDrinkSyrup,
    directSideSize,
    directSideSauce,
    directSideSecondSauce,
    kioskDessertSauce,
    kioskDessertExtra
  ]);

  const totalKioskPrice = singleKioskPrice * kioskQty;

  const handleAddKioskToCart = () => {
    if (!selectedProduct) return;
    const notesArr: string[] = [];
    const cat = selectedProduct.cat;

    // 1. Burgers & Wraps
    if (cat === 'Burgers & Wraps') {
      if (kioskMenuSize !== 'single') {
        let drinkSpec = kioskDrink.name;
        if (kioskDrinkLemon) {
          drinkSpec += ' (🍋 citroen, vast recept)';
        } else {
          if (kioskDrinkIce === 'zonder') drinkSpec += ' (zonder ijs)';
          if (kioskDrinkIce === 'extra') drinkSpec += ' (extra ijs)';
        }
        if (!kioskDrinkStraw) drinkSpec += ' (geen rietje)';

        notesArr.push(`${kioskMenuSize === 'medium' ? 'Medium' : 'Groot'} Menu (${kioskSide.name} • ${drinkSpec})`);
        notesArr.push(`Saus bij friet: ${kioskMenuSauce.name}`);
        if (kioskMenuSecondSauce) {
          notesArr.push(`Extra saus: ${kioskMenuSecondSauce.name} (+€0,80)`);
        }
      }

      if (kioskBurgerBun === 'brioche') notesArr.push('Brioche Bun (+€0,60)');
      if (kioskBurgerBun === 'glutenvrij') notesArr.push('Glutenvrij Bun (+€0,80)');

      if (kioskBurgerSauce === 'zonder') notesArr.push('Zonder saus op burger');
      if (kioskBurgerSauce === 'extra') notesArr.push('Extra saus op burger (+€0,30)');
      if (kioskBurgerSauce === 'dubbel') notesArr.push('Dubbele saus op burger (+€0,50)');
      if (kioskBurgerSauce === 'apart') notesArr.push('Saus apart in cupje (+€0,40)');

      if (kioskCustoms.onion === 'zonder') notesArr.push('Zonder ui');
      if (kioskCustoms.onion === 'extra') notesArr.push('Extra ui (+€0,30)');
      if (kioskCustoms.onion === 'gebakken') notesArr.push('Krokante gebakken ui (+€0,40)');

      if (kioskCustoms.pickle === 'zonder') notesArr.push('Zonder augurk');
      if (kioskCustoms.pickle === 'extra') notesArr.push('Extra augurk (+€0,30)');

      if (kioskCustoms.cheese === 'zonder') notesArr.push('Zonder kaas');
      if (kioskCustoms.cheese === 'extra') notesArr.push('Extra cheddar (+€0,60)');
      if (kioskCustoms.cheese === 'dubbel') notesArr.push('Dubbel cheddar (+€1,10)');

      if (kioskCustoms.lettuce === 'zonder') notesArr.push('Zonder sla');
      if (kioskCustoms.lettuce === 'extra') notesArr.push('Extra sla (+€0,20)');

      if (kioskCustoms.tomato === 'zonder') notesArr.push('Zonder tomaat');
      if (kioskCustoms.tomato === 'extra') notesArr.push('Extra tomaat (+€0,30)');

      if (kioskCustoms.bacon === 'toevoegen') notesArr.push('Crispy Bacon (+€0,80)');
      if (kioskCustoms.bacon === 'dubbel') notesArr.push('Dubbel Crispy Bacon (+€1,50)');

      if (kioskCustoms.jalapenos === 'toevoegen') notesArr.push('Pittige Jalapeños (+€0,30)');
      if (kioskCustoms.extraPatty === 'rundvlees') notesArr.push('Extra Rundvlees patty (+€1,80)');
      if (kioskCustoms.extraPatty === 'kip') notesArr.push('Extra Krokante Kip patty (+€1,80)');
    }

    // 2. Chicken & Snacks
    else if (cat === 'Chicken & Snacks') {
      if (kioskMenuSize !== 'single') {
        let drinkSpec = kioskDrink.name;
        if (kioskDrinkLemon) {
          drinkSpec += ' (🍋 citroen, vast recept)';
        } else {
          if (kioskDrinkIce === 'zonder') drinkSpec += ' (zonder ijs)';
          if (kioskDrinkIce === 'extra') drinkSpec += ' (extra ijs)';
        }
        notesArr.push(`${kioskMenuSize === 'medium' ? 'Medium' : 'Groot'} Menu (${kioskSide.name} • ${drinkSpec})`);
        notesArr.push(`Saus bij friet: ${kioskMenuSauce.name}`);
        if (kioskMenuSecondSauce) {
          notesArr.push(`Extra frietsaus: ${kioskMenuSecondSauce.name} (+€0,80)`);
        }
      }
      const chosenSauces = [kioskSnackSauce1.name];
      if (snackFreeSauceCount >= 2) chosenSauces.push(kioskSnackSauce2.name);
      if (snackFreeSauceCount >= 3) chosenSauces.push(kioskSnackSauce3.name);
      if (snackFreeSauceCount >= 4) chosenSauces.push(kioskSnackSauce4.name);

      notesArr.push(`Sauzen (${snackFreeSauceCount}x gratis inbegrepen): ${chosenSauces.join(', ')}`);

      if (kioskSnackExtraSauce) {
        notesArr.push(`Extra dipsaus: ${kioskSnackExtraSauce.name} (+€0,80)`);
      }
      if (kioskSnackPreparation === 'krokant') {
        notesArr.push('Extra krokant gebakken');
      }
    }

    // 3. Koude Dranken & WerkShakes / Warme Dranken
    else if (cat === 'Koude Dranken & WerkShakes' || cat === 'Warme Dranken & Koffie') {
      notesArr.push(`Formaat: ${directDrinkSize.toUpperCase()}`);
      if (cat === 'Koude Dranken & WerkShakes') {
        if (directDrinkLemon) {
          notesArr.push('Met schijfje citroen (+€0,15) · Geen ijskeuze');
        } else {
          if (directDrinkIce === 'zonder') notesArr.push('Zonder ijs');
          if (directDrinkIce === 'extra') notesArr.push('Extra veel ijs');
        }
        if (!directDrinkStraw) notesArr.push('Zonder rietje');
      }
      if (directDrinkSyrup === 'slagroom') notesArr.push('Toef Slagroom (+€0,50)');
      if (directDrinkSyrup === 'karamel') notesArr.push('Shot Karamel Siroop (+€0,40)');
      if (directDrinkSyrup === 'vanille') notesArr.push('Shot Vanille Siroop (+€0,40)');
      if (directDrinkSyrup === 'espresso') notesArr.push('Extra Shot Espresso (+€0,70)');
    }

    // 4. Friet & Sides
    else if (cat === 'Friet & Sides') {
      const lowerName = selectedProduct.name.toLowerCase();
      if (lowerName.includes('friet') && !lowerName.includes('klein') && !lowerName.includes('medium') && !lowerName.includes('groot')) {
        notesArr.push(`Formaat: ${directSideSize.toUpperCase()}`);
      }
      if (directSideSauce) {
        notesArr.push(`Saus: ${directSideSauce.name} (+${euro(directSideSauce.extraSingle)})`);
      } else {
        notesArr.push('Zonder saus');
      }
      if (directSideSecondSauce) {
        notesArr.push(`2e Saus: ${directSideSecondSauce.name} (+${euro(directSideSecondSauce.extraSingle)})`);
      }
      if (directSideSalt === 'zoutloos') notesArr.push('Zoutloos vers gebakken');
      if (directSideSalt === 'extra') notesArr.push('Extra gezouten');
    }

    // 5. WerkMeal Kids
    else if (cat === 'WerkMeal Kids') {
      notesArr.push(`Speeltje: ${kioskToy}`);
      notesArr.push(`Bijgerecht: ${kioskKidsSide}`);
      notesArr.push(`Drankje: ${kioskKidsDrink}`);
      notesArr.push(`Saus: ${kioskKidsSauce}`);
    }

    // 6. Desserts
    else if (cat === 'Desserts & IJs') {
      if (kioskDessertSauce === 'warme_choco') notesArr.push('Warme Chocoladesaus (+€0,60)');
      if (kioskDessertSauce === 'warme_karamel') notesArr.push('Warme Karamelsaus (+€0,60)');
      if (kioskDessertSauce === 'aardbei') notesArr.push('Aardbeiensaus (+€0,60)');
      if (kioskDessertExtra === 'oreo') notesArr.push('Oreo Crunch (+€0,50)');
      if (kioskDessertExtra === 'mm') notesArr.push('M&M Crunch (+€0,50)');
      if (kioskDessertExtra === 'stroopwafel') notesArr.push('Stroopwafel Crunch (+€0,50)');
      if (kioskDessertExtra === 'slagroom') notesArr.push('Slagroom (+€0,50)');
    }

    if (kioskSpecialNote.trim()) {
      notesArr.push(`Wens: ${kioskSpecialNote.trim()}`);
    }

    const finalTitle = `${selectedProduct.name}${kioskMenuSize !== 'single' ? ' Menu' : ''}`;
    addToCart({
      productId: selectedProduct.id,
      name: finalTitle,
      price: singleKioskPrice,
      qty: kioskQty,
      itemNote: notesArr.length > 0 ? notesArr.join(' • ') : undefined
    });
    setSelectedProduct(null);
  };

  // Burger Builder Calculation
  const burgerBuilderPrice = useMemo(() => {
    let p = 6.95;
    p += builderBun.extra + builderPatty.extra + builderSauce.extra;
    if (builderSecondSauce) p += 0.30;
    if (builderToppings.bacon) p += 0.80;
    if (builderToppings.extraCheddar) p += 0.60;
    if (builderToppings.jalapenos) p += 0.30;
    if (builderToppings.friedOnions) p += 0.40;
    if (builderToppings.tomato) p += 0.30;
    if (builderToppings.lettuce) p += 0.20;
    if (builderToppings.pickle) p += 0.30;
    if (builderToppings.friedEgg) p += 0.90;
    return p;
  }, [builderBun, builderPatty, builderSauce, builderSecondSauce, builderToppings]);

  const handleAddBuilderToCart = () => {
    const toppingsList: string[] = [];
    if (builderSecondSauce) toppingsList.push(`2e Saus: ${builderSecondSauce.name} (+€0,30)`);
    if (builderToppings.bacon) toppingsList.push('Bacon (+€0,80)');
    if (builderToppings.extraCheddar) toppingsList.push('Extra Cheddar (+€0,60)');
    if (builderToppings.jalapenos) toppingsList.push('Jalapeños (+€0,30)');
    if (builderToppings.friedOnions) toppingsList.push('Gebakken Uien (+€0,40)');
    if (builderToppings.tomato) toppingsList.push('Tomaat (+€0,30)');
    if (builderToppings.lettuce) toppingsList.push('Sla (+€0,20)');
    if (builderToppings.pickle) toppingsList.push('Augurk (+€0,30)');
    if (builderToppings.friedEgg) toppingsList.push('Gebakken Spiegelei (+€0,90)');

    const note = [builderBun.name, builderPatty.name, `Saus: ${builderSauce.name}`, ...toppingsList].join(' • ');
    addToCart({
      productId: 0,
      name: '✨ Custom Burger',
      price: burgerBuilderPrice,
      qty: 1,
      itemNote: note
    });
    setShowBuilderModal(false);
  };

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedCoupon.trim()) return;
    const res = applyCouponCode(typedCoupon);
    setCouponFeedback(res.message);
    if (res.success) setTypedCoupon('');
  };

  // Enforce login requirement before ordering: "je moet voordat je kan bestellen enzo inloggen"
  if (!currentPosUser) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950 overflow-y-auto pb-12">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
          <div 
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black mx-auto shadow-lg ${
              isKoekploeg 
                ? 'bg-gradient-to-br from-amber-500 via-yellow-400 to-amber-600 text-slate-950 shadow-amber-500/30' 
                : 'bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white shadow-blue-500/30'
            }`}
          >
            {brandConfig.logoEmoji}
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">Welkom bij {brandConfig.name}</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
              Log in met je medewerkers- of manager account, of bestel direct als klant.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setCurrentPosUser(ORDER_KIOSK_USER);
              }}
              className={`w-full py-4 px-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition shadow-lg active:scale-98 ${
                isKoekploeg 
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-amber-500/25' 
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25'
              }`}
            >
              <ShoppingBag className="w-5 h-5 text-slate-950" />
              <span>{isKoekploeg ? '🧇 Direct Bestellen (Klant Kassa)' : '🍔 Direct Bestellen (Bestel Account)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="w-full py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <span>🔑 Inloggen als Medewerker / Manager</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Veilige authenticatie via Supabase Cloud. Er worden nergens inloggegevens publiekelijk getoond.
          </p>

          {showLoginModal && (
            <PosLoginModal onClose={() => setShowLoginModal(false)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-125px)] sm:h-[calc(100vh-130px)] max-h-[880px] my-2 sm:my-3 mx-2 sm:mx-4 rounded-2xl border border-slate-800/80 shadow-2xl bg-slate-950 overflow-hidden">
      
      {/* Main Container */}
      <div className="relative flex-1 flex flex-col min-w-0 border-r border-slate-800 overflow-hidden">
        
        {/* Full-screen Overlay if Order Stop is active AND blockPickup is true AND no managerBypass */}
        {orderStopActive && orderStopConfig?.blockPickup && !managerBypass && (
          <div className="absolute inset-0 z-[100] bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center border border-rose-500/20 backdrop-blur-sm">
            
            {/* Manager Override Button */}
            <button 
              onClick={() => {
                const pin = prompt('Voer Master PIN in voor Manager Override:');
                if (pin && verifyMasterPin(pin)) {
                  setManagerBypass(true);
                  showToast('Manager Override geactiveerd voor deze sessie.', 'success');
                } else if (pin) {
                  showToast('Onjuiste Master PIN!', 'error');
                }
              }}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/50 hover:bg-slate-800 text-slate-600 hover:text-slate-400 transition"
              title="Manager Override"
            >
              <ShieldCheck className="w-5 h-5" />
            </button>

            {orderStopConfig.showClock && (
              <div className="absolute top-12 text-4xl font-black text-slate-700/50 font-mono tracking-tighter">
                {new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 animate-pulse ${
              orderStopConfig.theme === 'amber' ? 'bg-amber-500/20' :
              orderStopConfig.theme === 'emerald' ? 'bg-emerald-500/20' :
              orderStopConfig.theme === 'blue' ? 'bg-blue-500/20' :
              orderStopConfig.theme === 'slate' ? 'bg-slate-500/20' : 'bg-rose-500/20'
            }`}>
              <span className="text-5xl">{orderStopConfig.icon || '🛑'}</span>
            </div>
            
            <h2 className="text-3xl font-black text-white mb-3">{orderStopConfig.title || 'Tijdelijk geen bestellingen'}</h2>
            
            <p className="text-sm text-slate-400 max-w-sm mb-8 leading-relaxed">
              {orderStopText}
            </p>
            
            <div className="flex flex-col gap-4 items-center">
              <div className="text-xs font-bold text-slate-500 bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
                Je kunt wel je orderstatus inzien via de tracking-schermen.
              </div>
              
              {!orderStopConfig.blockPickup && (
                <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                  Override modus: Afhaalscherm blijft zichtbaar
                </div>
              )}
            </div>

            {orderStopConfig.showNews && (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-slate-900/50 border-t border-slate-800 flex items-center px-6 overflow-hidden">
                 <div className="flex items-center gap-4 animate-infinite-scroll whitespace-nowrap text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    <span>+++ BESTELSTOP ACTIEF +++</span>
                    <span>{orderStopText}</span>
                    <span>+++ BESTELSTOP ACTIEF +++</span>
                    <span>{orderStopText}</span>
                 </div>
              </div>
            )}
          </div>
        )}

        {/* Spoedbericht banner if Order Stop is active AND blockPickup is false */}
        {orderStopActive && !orderStopConfig?.blockPickup && (
          <div className={`border-b px-4 py-3 flex items-center justify-between animate-pulse transition-colors ${
            orderStopConfig.theme === 'amber' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
            orderStopConfig.theme === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
            orderStopConfig.theme === 'blue' ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' :
            orderStopConfig.theme === 'slate' ? 'bg-slate-500/10 border-slate-500/30 text-slate-300' :
            'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <span className="flex items-center gap-3">
              <span className="text-xl">{orderStopConfig.icon || '⚠️'}</span>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-tighter opacity-70">Spoedbericht: {orderStopConfig.title}</span>
                <span className="text-sm font-bold leading-tight">{orderStopText}</span>
              </div>
            </span>
            <div className="flex items-center gap-2">
               {orderStopConfig.showClock && <span className="text-xs font-mono opacity-50">{new Date().toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'})}</span>}
               <span className="text-[10px] px-2 py-0.5 rounded bg-black/30 font-black">STOP ACTIEF</span>
            </div>
          </div>
        )}

        {/* Search & Actions Toolbar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isKoekploeg ? "Zoek stroopwafel, koek, koffie of drankje..." : "Zoek burger, snack, drankje of ijsje..."}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGiftCardModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-white border border-purple-500/30 transition shadow-sm"
              title="Cadeaukaart bestellen of saldo controleren"
            >
              <Gift className="w-4 h-4 text-purple-400" />
              <span>Cadeaukaart</span>
            </button>

            <button
              onClick={() => setShowCustomItemModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Handmatig Bedrag</span>
            </button>

            <button
              onClick={() => {
                resetProductsToDefault();
              }}
              title="Herlaad de complete productencatalogus"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                isKoekploeg 
                  ? 'bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border-amber-500/30' 
                  : 'bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border-blue-500/30'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Menu Herladen ({displayProducts.length})</span>
            </button>

            <button
              onClick={handleSurpriseMe}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black shadow-md transition ${
                isKoekploeg 
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-slate-950 hover:from-amber-400 shadow-amber-500/25' 
                  : 'bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 text-white shadow-blue-500/20'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Verras Me!</span>
            </button>
          </div>
        </div>

        {/* Category Pills Bar */}
        <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/30 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                selectedCat === cat
                  ? isKoekploeg 
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30' 
                    : 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredProducts.map(prod => {
            const currentPrice = prod.onSale && prod.salePrice > 0 ? prod.salePrice : prod.price;

            return (
              <div
                key={prod.id}
                onClick={() => openKiosk(prod)}
                className={`group relative bg-slate-900 border rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                  prod.inStock 
                    ? 'border-slate-800 hover:border-blue-500/80 hover:shadow-blue-500/10' 
                    : 'border-slate-800/40 opacity-50 grayscale cursor-not-allowed'
                }`}
              >
                {/* Badges */}
                <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-start pointer-events-none">
                  {prod.onSale && (
                    <span className="flex items-center gap-1 bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow">
                      <Flame className="w-3 h-3 fill-white" /> ACTIE
                    </span>
                  )}
                  {!prod.inStock && (
                    <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md ml-auto">
                      UITVERKOCHT
                    </span>
                  )}
                </div>

                <div className="text-center my-3">
                  <div className="text-4xl sm:text-5xl select-none group-hover:scale-110 transition duration-200">
                    {prod.emoji}
                  </div>
                  <h3 className="font-bold text-sm text-slate-200 mt-2 line-clamp-2 leading-snug">
                    {prod.name}
                  </h3>
                </div>

                <div className="mt-auto pt-2 border-t border-slate-800/60 flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {prod.cat.split(' ')[0]}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    {prod.onSale && prod.salePrice > 0 && (
                      <span className="text-xs text-slate-500 line-through">
                        {euro(prod.price)}
                      </span>
                    )}
                    <span className="font-black text-sm text-blue-400">
                      {euro(currentPrice)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT SIDE: Dynamic Cart Sidebar */}
      <div className="w-full lg:w-96 flex flex-col bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 overflow-hidden">
        
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div>
            <h2 className="font-black text-base text-white flex items-center gap-2">
              <span>🛒 Bestelling</span>
              <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20 font-bold">
                #{orderNo}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              {cart.reduce((s, i) => s + i.qty, 0)} items in winkelmand
            </p>
          </div>

          {cart.length > 0 && (
            <button
              onClick={emptyCart}
              className="text-xs text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
              title="Winkelwagen legen"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center text-3xl mb-3">
                🍔
              </div>
              <p className="font-bold text-sm text-slate-400">Je bestelling is nog leeg</p>
              <p className="text-xs mt-1 text-slate-500 max-w-[220px]">
                Tik op een gerecht op het scherm om te bestellen of stel een eigen menu samen.
              </p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div
                key={item.id}
                className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-xs text-slate-200 leading-tight">
                      {item.name}
                    </h4>
                    {item.itemNote && (
                      <p className="text-[11px] text-blue-400/90 font-medium mt-0.5 leading-snug">
                        📝 {item.itemNote}
                      </p>
                    )}
                  </div>
                  <span className="font-black text-xs text-white whitespace-nowrap">
                    {euro(item.price * item.qty)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 mt-1 border-t border-slate-800/50">
                  <span className="text-[11px] text-slate-500 font-mono">
                    {euro(item.price)} per stuk
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateCartQty(idx, -1)}
                      className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 font-bold transition"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={item.qty}
                      onChange={e => setCartItemQty(idx, parseInt(e.target.value) || 1)}
                      className="w-9 h-6 bg-slate-900 border border-slate-700 rounded text-center text-xs font-bold text-white focus:outline-none"
                    />
                    <button
                      onClick={() => updateCartQty(idx, 1)}
                      className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 font-bold transition"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="w-6 h-6 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center ml-1 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout Controls Area */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 space-y-3">
          
          {/* Pricing breakdown */}
          <div className="space-y-1.5 text-xs text-slate-400 pt-1">
            <div className="flex justify-between">
              <span>Subtotaal</span>
              <span>{euro(rawSubtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-400 font-bold">
                <span>Korting</span>
                <span>- {euro(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-white pt-1 border-t border-slate-800">
              <span>Te betalen</span>
              <span className="text-blue-400 text-lg">{euro(finalTotal)}</span>
            </div>
          </div>

          {/* WerkLoyalty Spaarpaal Pop-up Button */}
          <button
            type="button"
            onClick={() => setShowLoyaltyPopup(true)}
            className="w-full py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-between transition shadow-sm"
          >
            <span className="flex items-center gap-1.5">
              <span>👑</span>
              <span>WerkLoyalty Spaarpaal</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
              Pop-up
            </span>
          </button>

          {/* Checkout Button */}
          <button
            disabled={cart.length === 0 || (orderStopActive && !currentPosUser?.is_admin)}
            onClick={onOpenPaymentModal}
            className={`w-full py-3.5 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
              cart.length === 0 || (orderStopActive && !currentPosUser?.is_admin)
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 active:translate-y-0.5'
            }`}
          >
            {orderStopActive && !currentPosUser?.is_admin ? (
              <>
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <span className="text-rose-400">BESTELSTOP ACTIEF</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>AFREKENEN ({euro(finalTotal)})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* MODAL 1: Kiosk Customizer Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Header */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedProduct.emoji}</span>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">
                    {selectedProduct.name}
                  </h3>
                  <span className="text-xs text-blue-200">
                    Standaard: {euro(selectedProduct.onSale && selectedProduct.salePrice > 0 ? selectedProduct.salePrice : selectedProduct.price)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              
              {/* Menu Size Selection (if Burger or Nuggets) */}
              {(selectedProduct.cat === 'Burgers & Wraps' || selectedProduct.cat === 'Chicken & Snacks') && (
                <div>
                  <h4 className="font-bold text-slate-300 mb-2">1. Formaat &amp; Menu</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setKioskMenuSize('single')}
                      className={`p-2.5 rounded-xl border text-left font-bold transition ${
                        kioskMenuSize === 'single'
                          ? 'border-amber-400 bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/40'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs">Alleen Los</div>
                      <div className="text-[11px] font-normal text-slate-500">Geen friet &amp; drank</div>
                    </button>

                    <button
                      onClick={() => setKioskMenuSize('medium')}
                      className={`p-2.5 rounded-xl border text-left font-bold transition ${
                        kioskMenuSize === 'medium'
                          ? 'border-amber-400 bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/40'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs">🍟 Medium Menu</div>
                      <div className="text-[11px] text-amber-400">+ € 4,70</div>
                    </button>

                    <button
                      onClick={() => setKioskMenuSize('large')}
                      className={`p-2.5 rounded-xl border text-left font-bold transition ${
                        kioskMenuSize === 'large'
                          ? 'border-amber-400 bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/40'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs">🍟 Groot Menu</div>
                      <div className="text-[11px] text-amber-400">+ € 5,40</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Side Dish (if Menu selected) */}
              {kioskMenuSize !== 'single' && (
                <div>
                  <h4 className="font-bold text-slate-300 mb-2">2. Kies Bijgerecht bij Menu</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_MENU_SIDES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setKioskSide(s)}
                        className={`p-2.5 rounded-xl border text-left font-bold transition flex items-center justify-between ${
                          kioskSide.id === s.id
                            ? 'border-amber-400 bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{s.emoji}</span>
                          <span className="text-xs">{s.name}</span>
                        </div>
                        {s.extra > 0 ? (
                          <span className="text-[10px] text-amber-400 font-mono">+{euro(s.extra)}</span>
                        ) : (
                          <span className="text-[10px] text-emerald-400">Gratis</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sauce Selection for Menu */}
              {kioskMenuSize !== 'single' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-300">3. Kies Saus bij Menu / Friet</h4>
                    <span className="text-[11px] text-slate-400">1e Saus inbegrepen</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {ALL_SAUCES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setKioskMenuSauce(s)}
                        className={`p-2 rounded-lg border text-left font-bold text-[11px] transition ${
                          kioskMenuSauce.id === s.id
                            ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span>{s.emoji}</span>
                          <span className="truncate">{s.name}</span>
                        </div>
                        {s.extraMenu > 0 ? (
                          <div className="text-[10px] text-amber-400">+{euro(s.extraMenu)}</div>
                        ) : (
                          <div className="text-[10px] text-emerald-400">Inbegrepen</div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Optional 2nd Sauce */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-300 text-[11px]">➕ Extra 2e Sausje (+€0,80)</span>
                      {kioskMenuSecondSauce && (
                        <button
                          onClick={() => setKioskMenuSecondSauce(null)}
                          className="text-[10px] text-rose-400 hover:underline"
                        >
                          Geen 2e saus
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      <button
                        onClick={() => setKioskMenuSecondSauce(null)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap font-bold transition ${
                          !kioskMenuSecondSauce
                            ? 'border-slate-600 bg-slate-800 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-500'
                        }`}
                      >
                        Geen extra saus
                      </button>
                      {ALL_SAUCES.map(s => (
                        <button
                          key={`second-${s.id}`}
                          onClick={() => setKioskMenuSecondSauce(s)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap font-bold transition flex items-center gap-1 ${
                            kioskMenuSecondSauce?.id === s.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          <span>{s.emoji}</span>
                          <span>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Drink Selection (if Menu selected) */}
              {kioskMenuSize !== 'single' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-300">4. Kies Drankje bij Menu</h4>
                    <span className="text-[11px] text-slate-400">{filteredMenuDrinks.length} keuzes</span>
                  </div>

                  {/* Drink Category Filters */}
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {[
                      { id: 'alle', label: 'Alle' },
                      { id: 'fris', label: '🥤 Frisdrank' },
                      { id: 'shakes', label: '🍓 Shakes' },
                      { id: 'koffie', label: '☕ Koffie & Warm' },
                      { id: 'energy_sap', label: '⚡ Energy & Sap' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setKioskDrinkFilter(tab.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                          kioskDrinkFilter === tab.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Drink Grid */}
                  <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {filteredMenuDrinks.map(d => (
                      <button
                        key={d.id}
                        onClick={() => setKioskDrink(d)}
                        className={`p-2 rounded-lg border text-left font-bold text-[11px] transition ${
                          kioskDrink.id === d.id
                            ? 'border-amber-400 bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-1 truncate">
                          <span>{d.emoji}</span>
                          <span className="truncate">{d.name}</span>
                        </div>
                        {d.extra > 0 ? (
                          <div className="text-[10px] text-amber-400">+{euro(d.extra)}</div>
                        ) : (
                          <div className="text-[10px] text-emerald-400">Inbegrepen</div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Drink options (Ice & Straw & Lemon) */}
                  <div className="space-y-2 pt-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                    {/* Citroen Keuze */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🍋</span>
                        <div>
                          <div className="text-xs font-bold text-white">Schijfje Citroen</div>
                          <div className="text-[10px] text-amber-400">
                            {kioskDrinkLemon ? 'Gekozen (+€0,15) · Ijskeuze vervalt' : '+€0,15 toevoegen'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setKioskDrinkLemon(!kioskDrinkLemon)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          kioskDrinkLemon 
                            ? 'bg-amber-400 text-slate-950 font-black shadow' 
                            : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                        }`}
                      >
                        {kioskDrinkLemon ? '✓ Met Citroen' : '+ Citroen (+€0,15)'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 block mb-1">🧊 IJs in drank</span>
                        {kioskDrinkLemon ? (
                          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 font-bold flex items-center justify-center text-center">
                            <span>🔒 Geen keuze over ijs bij citroen</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { id: 'normaal', label: 'Normaal' },
                              { id: 'zonder', label: 'Zonder' },
                              { id: 'extra', label: 'Extra' }
                            ].map(ice => (
                              <button
                                key={ice.id}
                                type="button"
                                onClick={() => setKioskDrinkIce(ice.id as any)}
                                className={`px-1 py-1 rounded text-[10px] font-bold transition text-center ${
                                  kioskDrinkIce === ice.id
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-slate-900 text-slate-400 border border-slate-800'
                                }`}
                              >
                                {ice.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-slate-400 block mb-1">🥤 Rietje</span>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => setKioskDrinkStraw(true)}
                            className={`px-1.5 py-1 rounded text-[10px] font-bold transition text-center ${
                              kioskDrinkStraw
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-900 text-slate-400 border border-slate-800'
                            }`}
                          >
                            Met rietje
                          </button>
                          <button
                            type="button"
                            onClick={() => setKioskDrinkStraw(false)}
                            className={`px-1.5 py-1 rounded text-[10px] font-bold transition text-center ${
                              !kioskDrinkStraw
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-slate-900 text-slate-400 border border-slate-800'
                            }`}
                          >
                            Zonder rietje
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Burger Customizations (Bun, Sauce, Ingredients) */}
              {selectedProduct.cat === 'Burgers & Wraps' && (
                <div className="space-y-3 pt-1">
                  <h4 className="font-bold text-slate-300">5. Burger &amp; Ingrediënten Aanpassen</h4>
                  
                  {/* Bun selection */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-slate-300 text-xs block mb-1.5">🍞 Keuze Broodje</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'sesam', label: 'Sesambroodje', extra: 0 },
                        { id: 'brioche', label: 'Brioche Bun', extra: 0.60 },
                        { id: 'glutenvrij', label: 'Glutenvrij Bun', extra: 0.80 }
                      ].map(b => (
                        <button
                          key={b.id}
                          onClick={() => setKioskBurgerBun(b.id as any)}
                          className={`p-1.5 rounded-lg border text-center font-bold text-[11px] transition ${
                            kioskBurgerBun === b.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-900 text-slate-400'
                          }`}
                        >
                          <div>{b.label}</div>
                          {b.extra > 0 && <div className="text-[10px] text-amber-400">+{euro(b.extra)}</div>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sauce on Burger */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-slate-300 text-xs block mb-1.5">🥫 Saus op de burger</span>
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        { id: 'normaal', label: 'Normaal' },
                        { id: 'zonder', label: 'Zonder' },
                        { id: 'extra', label: 'Extra (+0,30)' },
                        { id: 'dubbel', label: 'Dubbel (+0,50)' },
                        { id: 'apart', label: 'Apart (+0,40)' }
                      ].map(s => (
                        <button
                          key={s.id}
                          onClick={() => setKioskBurgerSauce(s.id as any)}
                          className={`p-1 rounded text-[10px] font-bold transition text-center ${
                            kioskBurgerSauce === s.id
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ingredients adjustment */}
                  <div className="space-y-1.5">
                    {[
                      { id: 'onion', label: '🧅 Uien', options: [{ id: 'normaal', l: 'Normaal' }, { id: 'zonder', l: 'Zonder' }, { id: 'extra', l: 'Extra (+0,30)' }, { id: 'gebakken', l: 'Krokant gebakken (+0,40)' }] },
                      { id: 'pickle', label: '🥒 Augurk', options: [{ id: 'normaal', l: 'Normaal' }, { id: 'zonder', l: 'Zonder' }, { id: 'extra', l: 'Extra (+0,30)' }] },
                      { id: 'cheese', label: '🧀 Cheddar Kaas', options: [{ id: 'normaal', l: 'Normaal' }, { id: 'zonder', l: 'Zonder' }, { id: 'extra', l: 'Extra (+0,60)' }, { id: 'dubbel', l: 'Dubbel (+1,10)' }] },
                      { id: 'lettuce', label: '🥬 IJsbergsla', options: [{ id: 'normaal', l: 'Normaal' }, { id: 'zonder', l: 'Zonder' }, { id: 'extra', l: 'Extra (+0,20)' }] },
                      { id: 'tomato', label: '🍅 Verse Tomaat', options: [{ id: 'normaal', l: 'Normaal' }, { id: 'zonder', l: 'Zonder' }, { id: 'extra', l: 'Extra (+0,30)' }] },
                      { id: 'bacon', label: '🥓 Crispy Bacon', options: [{ id: 'geen', l: 'Geen' }, { id: 'toevoegen', l: 'Toevoegen (+0,80)' }, { id: 'dubbel', l: 'Dubbel (+1,50)' }] },
                      { id: 'jalapenos', label: '🌶️ Jalapeños', options: [{ id: 'geen', l: 'Geen' }, { id: 'toevoegen', l: 'Toevoegen (+0,30)' }] },
                      { id: 'extraPatty', label: '🥩 Extra Patty', options: [{ id: 'geen', l: 'Geen' }, { id: 'rundvlees', l: '+ Rundvlees (+1,80)' }, { id: 'kip', l: '+ Krokante Kip (+1,80)' }] }
                    ].map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="font-bold text-slate-300 text-[11px]">{item.label}</span>
                        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                          {item.options.map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => setKioskCustoms(prev => ({ ...prev, [item.id]: opt.id }))}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                                (kioskCustoms as any)[item.id] === opt.id
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {opt.l}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chicken & Snacks Customization */}
              {selectedProduct.cat === 'Chicken & Snacks' && (
                <div className="space-y-3.5">
                  {/* Free Sauce Allowance Highlight Banner */}
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                    snackFreeSauceCount > 1 
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200' 
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🥫</span>
                      <div>
                        <div className="font-black text-xs">
                          {snackFreeSauceCount > 1 
                            ? `🎉 ${snackFreeSauceCount}x GRATIS sauzen inbegrepen!` 
                            : '1x Gratis dipsaus inbegrepen'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {snackFreeSauceCount > 1 
                            ? `Omdat je een grotere portie (${selectedProduct.name}) bestelt, krijg je ${snackFreeSauceCount} sauzen cadeau!` 
                            : 'Kies hieronder je favoriete smaak saus.'}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-black px-2 py-0.5 rounded-full bg-amber-400 text-slate-950">
                      {snackFreeSauceCount}x €0,00
                    </span>
                  </div>

                  {/* 1e Gratis Dipsaus */}
                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5 text-xs flex items-center justify-between">
                      <span>🥫 1e Dipsaus (Gratis inbegrepen)</span>
                      <span className="text-emerald-400 font-mono text-[10px]">INBEGREPEN</span>
                    </h4>
                    <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
                      {ALL_SAUCES.map(s => (
                        <button
                          key={`snack-1-${s.id}`}
                          onClick={() => setKioskSnackSauce1(s)}
                          className={`p-1.5 rounded-lg border text-left font-bold text-[11px] transition ${
                            kioskSnackSauce1.id === s.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-1 truncate">
                            <span>{s.emoji}</span>
                            <span className="truncate">{s.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2e Gratis Dipsaus (if snackFreeSauceCount >= 2) */}
                  {snackFreeSauceCount >= 2 && (
                    <div>
                      <h4 className="font-bold text-slate-300 mb-1.5 text-xs flex items-center justify-between">
                        <span>🥫 2e Dipsaus (Gratis inbegrepen)</span>
                        <span className="text-emerald-400 font-mono text-[10px]">INBEGREPEN</span>
                      </h4>
                      <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {ALL_SAUCES.map(s => (
                          <button
                            key={`snack-2-${s.id}`}
                            onClick={() => setKioskSnackSauce2(s)}
                            className={`p-1.5 rounded-lg border text-left font-bold text-[11px] transition ${
                              kioskSnackSauce2.id === s.id
                                ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1 truncate">
                              <span>{s.emoji}</span>
                              <span className="truncate">{s.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3e Gratis Dipsaus (if snackFreeSauceCount >= 3) */}
                  {snackFreeSauceCount >= 3 && (
                    <div>
                      <h4 className="font-bold text-slate-300 mb-1.5 text-xs flex items-center justify-between">
                        <span>🥫 3e Dipsaus (Gratis inbegrepen)</span>
                        <span className="text-emerald-400 font-mono text-[10px]">INBEGREPEN</span>
                      </h4>
                      <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {ALL_SAUCES.map(s => (
                          <button
                            key={`snack-3-${s.id}`}
                            onClick={() => setKioskSnackSauce3(s)}
                            className={`p-1.5 rounded-lg border text-left font-bold text-[11px] transition ${
                              kioskSnackSauce3.id === s.id
                                ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1 truncate">
                              <span>{s.emoji}</span>
                              <span className="truncate">{s.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4e Gratis Dipsaus (if snackFreeSauceCount >= 4) */}
                  {snackFreeSauceCount >= 4 && (
                    <div>
                      <h4 className="font-bold text-slate-300 mb-1.5 text-xs flex items-center justify-between">
                        <span>🥫 4e Dipsaus (Gratis inbegrepen)</span>
                        <span className="text-emerald-400 font-mono text-[10px]">INBEGREPEN</span>
                      </h4>
                      <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {ALL_SAUCES.map(s => (
                          <button
                            key={`snack-4-${s.id}`}
                            onClick={() => setKioskSnackSauce4(s)}
                            className={`p-1.5 rounded-lg border text-left font-bold text-[11px] transition ${
                              kioskSnackSauce4.id === s.id
                                ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1 truncate">
                              <span>{s.emoji}</span>
                              <span className="truncate">{s.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Optioneel Extra Betaalde Saus */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="font-bold text-slate-300 text-xs">➕ Extra dipsaus (+€0,80)</h4>
                      {kioskSnackExtraSauce && (
                        <button
                          onClick={() => setKioskSnackExtraSauce(null)}
                          className="text-[10px] text-rose-400 hover:underline"
                        >
                          Verwijder extra saus
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      <button
                        onClick={() => setKioskSnackExtraSauce(null)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap font-bold transition ${
                          !kioskSnackExtraSauce
                            ? 'border-slate-600 bg-slate-800 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-500'
                        }`}
                      >
                        Geen extra saus
                      </button>
                      {ALL_SAUCES.map(s => (
                        <button
                          key={`snack-extra-${s.id}`}
                          onClick={() => setKioskSnackExtraSauce(s)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap font-bold transition flex items-center gap-1 ${
                            kioskSnackExtraSauce?.id === s.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          <span>{s.emoji}</span>
                          <span>{s.name}</span>
                          <span className="text-[10px] text-amber-400 font-mono">+€0,80</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-slate-300 text-xs">🔥 Bereiding</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setKioskSnackPreparation('normaal')}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                          kioskSnackPreparation === 'normaal'
                            ? 'bg-amber-400 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Normaal
                      </button>
                      <button
                        onClick={() => setKioskSnackPreparation('krokant')}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                          kioskSnackPreparation === 'krokant'
                            ? 'bg-amber-400 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Extra knapperig &amp; heet
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Standalone Drinks Customization */}
              {(selectedProduct.cat === 'Koude Dranken & WerkShakes' || selectedProduct.cat === 'Warme Dranken & Koffie') && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-slate-300 mb-2">Formaat Drankje</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'klein', label: 'Klein / Standaard', extra: 0 },
                        { id: 'medium', label: 'Medium', extra: 0.60 },
                        { id: 'groot', label: 'Groot', extra: 1.10 }
                      ].map(size => (
                        <button
                          key={size.id}
                          onClick={() => setDirectDrinkSize(size.id as any)}
                          className={`p-2.5 rounded-xl border text-center font-bold transition ${
                            directDrinkSize === size.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          <div className="text-xs">{size.label}</div>
                          {size.extra > 0 && <div className="text-[10px] text-amber-400">+{euro(size.extra)}</div>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedProduct.cat === 'Koude Dranken & WerkShakes' && (
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                      {/* Citroen Keuze */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🍋</span>
                          <div>
                            <div className="text-xs font-bold text-white">Schijfje Citroen toevoegen</div>
                            <div className="text-[10px] text-amber-400">
                              {directDrinkLemon ? 'Citroen actief (+€0,15) · Ijskeuze vervalt' : '+€0,15 extra verfrissend'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDirectDrinkLemon(!directDrinkLemon)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            directDrinkLemon 
                              ? 'bg-amber-400 text-slate-950 shadow font-black' 
                              : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                          }`}
                        >
                          {directDrinkLemon ? '✓ Met Citroen' : '+ Citroen (+€0,15)'}
                        </button>
                      </div>

                      <div>
                        <span className="font-bold text-slate-300 text-xs block mb-1">🧊 IJs in drank</span>
                        {directDrinkLemon ? (
                          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 font-bold flex items-center justify-center text-center">
                            <span>🔒 Geen keuze over ijs bij citroen (vast Werkdonalds recept)</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { id: 'normaal', label: '🧊 Normaal ijs' },
                              { id: 'zonder', label: '🚫 Zonder ijs' },
                              { id: 'extra', label: '❄️ Extra ijs' }
                            ].map(ice => (
                              <button
                                key={ice.id}
                                type="button"
                                onClick={() => setDirectDrinkIce(ice.id as any)}
                                className={`p-1.5 rounded text-[10px] font-bold text-center transition ${
                                  directDrinkIce === ice.id
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                                }`}
                              >
                                {ice.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-300 font-bold">Rietje erbij?</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setDirectDrinkStraw(true)}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                              directDrinkStraw ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-400'
                            }`}
                          >
                            Ja, graag
                          </button>
                          <button
                            type="button"
                            onClick={() => setDirectDrinkStraw(false)}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                              !directDrinkStraw ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-400'
                            }`}
                          >
                            Geen rietje
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5">Smaakmakers &amp; Extra Shots</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'geen', label: 'Geen extra toevoeging', extra: 0 },
                        { id: 'slagroom', label: '🥛 Toef verse slagroom', extra: 0.50 },
                        { id: 'karamel', label: '🍮 Karamel siroop shot', extra: 0.40 },
                        { id: 'vanille', label: '🍦 Vanille siroop shot', extra: 0.40 },
                        { id: 'espresso', label: '☕ Extra shot espresso', extra: 0.70 }
                      ].map(syrup => (
                        <button
                          key={syrup.id}
                          onClick={() => setDirectDrinkSyrup(syrup.id as any)}
                          className={`p-2 rounded-xl border text-left font-bold text-[11px] transition ${
                            directDrinkSyrup === syrup.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          <div>{syrup.label}</div>
                          {syrup.extra > 0 && <div className="text-[10px] text-amber-400">+{euro(syrup.extra)}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Standalone Sides / Friet Customization */}
              {selectedProduct.cat === 'Friet & Sides' && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5">🥫 Kies Saus bij de Friet</h4>
                    <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                      <button
                        onClick={() => setDirectSideSauce(null)}
                        className={`p-1.5 rounded-lg border text-left font-bold text-[11px] transition ${
                          !directSideSauce
                            ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                            : 'border-slate-800 bg-slate-950 text-slate-400'
                        }`}
                      >
                        <div>🚫 Zonder saus</div>
                        <div className="text-[10px] text-slate-500">€ 0,00</div>
                      </button>
                      {ALL_SAUCES.map(s => (
                        <button
                          key={`side-sauce-${s.id}`}
                          onClick={() => setDirectSideSauce(s)}
                          className={`p-1.5 rounded-lg border text-left font-bold text-[11px] transition ${
                            directSideSauce?.id === s.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          <div className="truncate">{s.emoji} {s.name}</div>
                          <div className="text-[10px] text-amber-400">+{euro(s.extraSingle)}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="font-bold text-slate-300">➕ Extra 2e Sausje toevoegen</h4>
                      {directSideSecondSauce && (
                        <button
                          onClick={() => setDirectSideSecondSauce(null)}
                          className="text-[10px] text-rose-400 hover:underline"
                        >
                          Geen 2e saus
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      <button
                        onClick={() => setDirectSideSecondSauce(null)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap font-bold transition ${
                          !directSideSecondSauce
                            ? 'border-slate-600 bg-slate-800 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-500'
                        }`}
                      >
                        Geen
                      </button>
                      {ALL_SAUCES.map(s => (
                        <button
                          key={`side-sauce-2-${s.id}`}
                          onClick={() => setDirectSideSecondSauce(s)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap font-bold transition flex items-center gap-1 ${
                            directSideSecondSauce?.id === s.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          <span>{s.emoji}</span>
                          <span>{s.name} (+{euro(s.extraSingle)})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-slate-300 text-xs">🧂 Zoutgehalte</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                      {[
                        { id: 'normaal', l: 'Normaal zout' },
                        { id: 'zoutloos', l: 'Zoutloos vers gebakken' },
                        { id: 'extra', l: 'Extra zout' }
                      ].map(salt => (
                        <button
                          key={salt.id}
                          onClick={() => setDirectSideSalt(salt.id as any)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                            directSideSalt === salt.id
                              ? 'bg-amber-400 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {salt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* WerkMeal Kids Customization */}
              {selectedProduct.cat === 'WerkMeal Kids' && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5">🧸 Kies een Speeltje</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {KIDS_TOYS.map(toy => (
                        <button
                          key={toy}
                          onClick={() => setKioskToy(toy)}
                          className={`p-2 rounded-xl border text-left font-bold text-[11px] transition ${
                            kioskToy === toy
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {toy}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5">🍟 Kies Bijgerecht</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {KIDS_SIDES.map(side => (
                        <button
                          key={side}
                          onClick={() => setKioskKidsSide(side)}
                          className={`p-2 rounded-xl border text-left font-bold text-[11px] transition ${
                            kioskKidsSide === side
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {side}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5">🥤 Kies Drankje</h4>
                    <div className="grid grid-cols-3 gap-1.5">
                      {KIDS_DRINKS.map(drink => (
                        <button
                          key={drink}
                          onClick={() => setKioskKidsDrink(drink)}
                          className={`p-2 rounded-xl border text-left font-bold text-[11px] transition ${
                            kioskKidsDrink === drink
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {drink}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5">🥫 Kies Sausje</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {KIDS_SAUCES.map(sauce => (
                        <button
                          key={sauce}
                          onClick={() => setKioskKidsSauce(sauce)}
                          className={`p-2 rounded-xl border text-left font-bold text-[11px] transition ${
                            kioskKidsSauce === sauce
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {sauce}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Desserts Customization */}
              {selectedProduct.cat === 'Desserts & IJs' && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5">🍫 Extra Warme Saus (+€0,60)</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'geen', label: 'Geen extra saus' },
                        { id: 'warme_choco', label: '🍫 Warme Chocoladesaus (+€0,60)' },
                        { id: 'warme_karamel', label: '🍮 Warme Karamelsaus (+€0,60)' },
                        { id: 'aardbei', label: '🍓 Warme Aardbeiensaus (+€0,60)' }
                      ].map(s => (
                        <button
                          key={s.id}
                          onClick={() => setKioskDessertSauce(s.id as any)}
                          className={`p-2 rounded-xl border text-left font-bold text-[11px] transition ${
                            kioskDessertSauce === s.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-300 mb-1.5">🍪 Extra Crunch Topping (+€0,50)</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'geen', label: 'Geen extra topping' },
                        { id: 'oreo', label: '🍪 Oreo Kruimels (+€0,50)' },
                        { id: 'mm', label: '🍬 M&M Kruimels (+€0,50)' },
                        { id: 'stroopwafel', label: '🧇 Stroopwafel (+€0,50)' },
                        { id: 'slagroom', label: '🥛 Toef Slagroom (+€0,50)' }
                      ].map(t => (
                        <button
                          key={t.id}
                          onClick={() => setKioskDessertExtra(t.id as any)}
                          className={`p-2 rounded-xl border text-left font-bold text-[11px] transition ${
                            kioskDessertExtra === t.id
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Special instructions */}
              <div className="pt-2 border-t border-slate-800/80">
                <h4 className="font-bold text-slate-300 mb-1">📝 Speciale wens voor de keuken</h4>
                <input
                  type="text"
                  value={kioskSpecialNote}
                  onChange={e => setKioskSpecialNote(e.target.value)}
                  placeholder="Bijv. saus apart in cupje, friet goed doorbakken..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setKioskQty(prev => Math.max(1, prev - 1))}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-bold"
                >
                  -
                </button>
                <span className="w-8 text-center font-black text-sm text-white">{kioskQty}</span>
                <button
                  onClick={() => setKioskQty(prev => prev + 1)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-bold"
                >
                  +
                </button>
              </div>

              <button
                onClick={handleAddKioskToCart}
                className="flex-1 py-3 px-4 rounded-xl font-black text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-between shadow-lg shadow-emerald-500/10 transition active:scale-[0.99]"
              >
                <span>Toevoegen aan bestelling</span>
                <span>{euro(totalKioskPrice)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Burger Builder Modal */}
      {showBuilderModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 font-black flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <span>✨ Bouw je Eigen Burger</span>
              </div>
              <button onClick={() => setShowBuilderModal(false)} className="hover:opacity-75">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-2">1. Kies Broodje</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: 'Sesambroodje', extra: 0 },
                    { name: 'Brioche Bun', extra: 0.60 },
                    { name: 'Glutenvrij Broodje', extra: 0.80 },
                    { name: 'Zacht Wit Bolletje', extra: 0 },
                    { name: 'Rustiek Meergranen', extra: 0.50 }
                  ].map(b => (
                    <button
                      key={b.name}
                      onClick={() => setBuilderBun(b)}
                      className={`p-2.5 rounded-xl border text-left font-bold transition ${
                        builderBun.name === b.name ? 'border-amber-400 bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40' : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div>{b.name}</div>
                      {b.extra > 0 && <div className="text-[10px] text-amber-400">+{euro(b.extra)}</div>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-2">2. Kies Burger Patty</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: '100% Rundvlees', extra: 0 },
                    { name: 'Krokante Kip', extra: 0 },
                    { name: 'Gegrilde Kipfilet', extra: 0.80 },
                    { name: 'Veggie Plant-Based', extra: 0 },
                    { name: 'Dubbel Rundvlees', extra: 1.80 },
                    { name: 'Triple Rundvlees', extra: 3.20 }
                  ].map(p => (
                    <button
                      key={p.name}
                      onClick={() => setBuilderPatty(p)}
                      className={`p-2.5 rounded-xl border text-left font-bold transition ${
                        builderPatty.name === p.name ? 'border-amber-400 bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40' : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div>{p.name}</div>
                      {p.extra > 0 && <div className="text-[10px] text-amber-400">+{euro(p.extra)}</div>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-2">3. Kies 1e Saus</label>
                <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                  {[
                    { name: 'Special Saus', extra: 0 },
                    { name: 'Smokey BBQ', extra: 0 },
                    { name: 'Truffel Mayo', extra: 0.40 },
                    { name: 'Samurai Saus (Pikant)', extra: 0.20 },
                    { name: 'Romige Knoflooksaus', extra: 0 },
                    { name: 'Curry Gewürz', extra: 0 },
                    { name: 'Honing-Mosterd', extra: 0.20 },
                    { name: 'WerkChili Saus', extra: 0.20 },
                    { name: 'Warme Satésaus', extra: 0.50 },
                    { name: 'Joppiesaus', extra: 0.20 },
                    { name: 'Classic Ketchup', extra: 0 },
                    { name: 'Zaanse Mayonaise', extra: 0 }
                  ].map(s => (
                    <button
                      key={s.name}
                      onClick={() => setBuilderSauce(s)}
                      className={`p-2 rounded-xl border text-left font-bold text-[11px] transition ${
                        builderSauce.name === s.name ? 'border-amber-400 bg-amber-400/20 text-amber-300' : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate">{s.name}</div>
                      {s.extra > 0 && <div className="text-[10px] text-amber-400">+{euro(s.extra)}</div>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-300 block">4. Kies 2e Saus (optioneel, +€0,30)</label>
                  {builderSecondSauce && (
                    <button
                      onClick={() => setBuilderSecondSauce(null)}
                      className="text-[10px] text-rose-400 hover:underline"
                    >
                      Geen 2e saus
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    onClick={() => setBuilderSecondSauce(null)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap font-bold transition ${
                      !builderSecondSauce
                        ? 'border-slate-600 bg-slate-800 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-500'
                    }`}
                  >
                    Geen 2e saus
                  </button>
                  {ALL_SAUCES.map(s => (
                    <button
                      key={`builder-2-${s.id}`}
                      onClick={() => setBuilderSecondSauce({ name: s.name, extra: 0.30 })}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap font-bold transition flex items-center gap-1 ${
                        builderSecondSauce?.name === s.name
                          ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      <span>{s.emoji}</span>
                      <span>{s.name} (+€0,30)</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-2">5. Extra Toppings &amp; Beleg</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'bacon', label: '🥓 Crispy Bacon (+€0,80)' },
                    { id: 'extraCheddar', label: '🧀 Extra Cheddar (+€0,60)' },
                    { id: 'jalapenos', label: '🌶️ Pittige Jalapeños (+€0,30)' },
                    { id: 'friedOnions', label: '🧅 Gebakken Uien (+€0,40)' },
                    { id: 'tomato', label: '🍅 Verse Tomaat (+€0,30)' },
                    { id: 'lettuce', label: '🥬 IJsbergsla (+€0,20)' },
                    { id: 'pickle', label: '🥒 Augurk (+€0,30)' },
                    { id: 'friedEgg', label: '🍳 Gebakken Spiegelei (+€0,90)' }
                  ].map(t => (
                    <label key={t.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                      <input
                        type="checkbox"
                        checked={Boolean(builderToppings[t.id])}
                        onChange={e => setBuilderToppings(prev => ({ ...prev, [t.id]: e.target.checked }))}
                        className="rounded border-slate-700 bg-slate-900 text-amber-400 focus:ring-amber-400"
                      />
                      <span className="font-bold text-slate-300">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-xs">Prijs samengesteld:</span>
                <div className="text-amber-400 font-black text-lg">{euro(burgerBuilderPrice)}</div>
              </div>
              <button
                onClick={handleAddBuilderToCart}
                className="py-3 px-6 rounded-xl font-black text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg active:scale-[0.99] transition"
              >
                In Winkelwagen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Handmatig Bedrag Toevoegen */}
      {showCustomItemModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-base text-white">➕ Handmatig Bedrag Toevoegen</h3>
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">Omschrijving</label>
              <input
                type="text"
                value={customItemName}
                onChange={e => setCustomItemName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">Bedrag in Euro (€)</label>
              <input
                type="number"
                step="0.05"
                placeholder="0.00"
                value={customItemPrice}
                onChange={e => setCustomItemPrice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCustomItemModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300"
              >
                Annuleren
              </button>
              <button
                onClick={() => {
                  const pr = parseFloat(customItemPrice);
                  if (isNaN(pr) || pr <= 0) {
                    showToast('Voer een geldig bedrag in.', 'warning');
                    return;
                  }
                  addToCart({
                    productId: 9999,
                    name: customItemName || 'Toeslag / Extra item',
                    price: pr,
                    qty: 1,
                    itemNote: 'Handmatig bedrag'
                  });
                  setShowCustomItemModal(false);
                  setCustomItemPrice('');
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950"
              >
                Toevoegen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: WerkLoyalty Spaarpaal Quick Popup */}
      <LoyaltyQuickPopup
        isOpen={showLoyaltyPopup}
        onClose={() => setShowLoyaltyPopup(false)}
      />

      {/* MODAL 4: Gift Card Modal */}
      <GiftCardModal
        isOpen={showGiftCardModal}
        onClose={() => setShowGiftCardModal(false)}
      />

    </div>
  );
};
