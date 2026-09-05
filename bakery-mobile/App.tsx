import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, TextInput, ScrollView, 
  SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  StatusBar, Modal, Dimensions, Switch, Image
} from 'react-native';
import { 
  Mail, AlertCircle, Plus, Trash2, CheckCircle2, 
  PackageSearch, ChefHat, LineChart as LineChartIcon, Settings as SettingsIcon, LogOut,
  Menu, X, ClipboardList, FlaskConical, Calculator, XCircle, Save, ChevronDown
} from 'lucide-react-native';
import { 
  auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  sendPasswordResetEmail, signOut, onAuthStateChanged, signInWithCredential, GoogleAuthProvider,
  collection, doc, onSnapshot, setDoc, deleteDoc
} from './src/firebase';
import { LineChart } from 'react-native-chart-kit';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

// --- Types ---
interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  initialStock: number;
  costPerUnit: number;
  category: string;
  threshold?: number;
  dateAdded: string;
  gstRate?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  sugar?: number;
}

interface IngredientRequirement {
  materialId: string;
  amount: number;
  unit: string;
}

interface MenuItem {
  id: string;
  name: string;
  sellingPrice: number;
  recipe: IngredientRequirement[];
  servings?: number;
}

interface Order {
  id: string;
  menuItemId: string;
  quantity: number;
  date: string;
  customerName?: string;
  customerPhone?: string;
}

interface Experiment {
  id: string;
  name: string;
  result: 'pending' | 'success' | 'failure';
  notes: string;
  date: string;
}

interface BakerySettings {
  name: string;
  gstRate?: number;
  hasGstNumber?: boolean;
  logo?: string;
}

const INITIAL_MATERIALS: RawMaterial[] = [
  { id: '1', name: 'All-Purpose Flour', unit: 'g', initialStock: 10000, costPerUnit: 0.002, category: 'Raw Materials', dateAdded: '2026-01-01', gstRate: 0 },
  { id: '2', name: 'Granulated Sugar', unit: 'g', initialStock: 5000, costPerUnit: 0.0015, category: 'Raw Materials', dateAdded: '2026-01-02', gstRate: 5 },
];

function MobileServingsInput({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  const [localValue, setLocalValue] = useState(String(value));
  const isFocused = React.useRef(false);

  useEffect(() => {
    if (!isFocused.current) setLocalValue(String(value));
  }, [value]);

  return (
    <TextInput
      value={localValue}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
        const num = parseInt(localValue);
        const final = isNaN(num) || num < 1 ? 1 : num;
        setLocalValue(String(final));
        onChange(final);
      }}
      onChangeText={(text) => {
        setLocalValue(text);
        const num = parseInt(text);
        if (!isNaN(num) && num >= 1) {
          onChange(num);
        }
      }}
      keyboardType="numeric"
      className={className}
    />
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  if (!isAuthReady) {
    return (
      <View className="flex-1 bg-stone-50 justify-center items-center">
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50 pt-10">
      <StatusBar barStyle="dark-content" />
      {user ? <MainApp user={user} /> : <AuthScreen />}
    </SafeAreaView>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: '64214703578-mcfmtnltica36jobl63m0k8l1ddplu8g.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      setLoading(true);
      signInWithCredential(auth, credential).catch(err => {
        Alert.alert('Google Sign-In Error', err.message);
        setLoading(false);
      });
    } else if (response?.type === 'error') {
      Alert.alert('Google Sign-In Failed', response.error?.message || 'Something went wrong');
    }
  }, [response]);

  const handleAuth = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill in all fields');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      Alert.alert('Authentication Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!email) return Alert.alert('Error', 'Please enter your email to reset password');
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('Success', 'Password reset email sent!');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-center px-8 bg-surface">
      <View className="items-center mb-10">
        <View className="w-16 h-16 bg-primary/10 rounded-2xl justify-center items-center mb-4">
          <ChefHat size={32} color="#8B5E3C" />
        </View>
        <Text className="text-2xl font-bold text-stone-800 tracking-tight">BakeryOS Mobile</Text>
        <Text className="text-stone-500 text-sm mt-2 text-center">Manage your inventory & menu from anywhere.</Text>
      </View>

      <View className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
        <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Email</Text>
        <TextInput 
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-4 text-stone-800"
          placeholder="bakery@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View className="flex-row justify-between items-center px-1 mb-1">
          <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest">Password</Text>
          {mode === 'login' && (
            <TouchableOpacity onPress={resetPassword}>
              <Text className="text-xs font-bold text-primary">Forgot?</Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput 
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-6 text-stone-800"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity 
          onPress={handleAuth}
          disabled={loading}
          className="w-full bg-primary py-4 rounded-xl flex-row justify-center items-center opacity-90 active:opacity-100"
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="font-bold text-white text-base">{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>}
        </TouchableOpacity>

        <View className="flex-row items-center my-6">
          <View className="flex-1 h-[1px] bg-stone-200" />
          <Text className="mx-4 text-xs font-bold text-stone-400 uppercase tracking-widest">OR</Text>
          <View className="flex-1 h-[1px] bg-stone-200" />
        </View>

        <TouchableOpacity 
          onPress={() => promptAsync()}
          disabled={!request || loading}
          className="w-full bg-white border border-stone-200 py-4 rounded-xl flex-row justify-center items-center opacity-90 active:opacity-100 mb-2"
        >
          <Text className="font-bold text-stone-800 text-base">Sign in with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} className="mt-4 items-center">
          <Text className="text-stone-500 text-sm">{mode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

type TabId = 'inventory' | 'menu' | 'orders' | 'experiments' | 'summary' | 'settings';

interface TabButtonProps {
  id: TabId;
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;
  label: string;
  icon: any;
}

const TabButton = ({ id, activeTab, setActiveTab, label, icon: Icon }: TabButtonProps) => (
  <TouchableOpacity
    onPress={() => setActiveTab(id)}
    activeOpacity={0.7}
    className="flex-row items-center gap-2 px-4 py-3 relative"
    style={{ borderBottomWidth: activeTab === id ? 2 : 0, borderBottomColor: '#8B5E3C' }}
  >
    <Icon size={16} color={activeTab === id ? '#8B5E3C' : '#a8a29e'} />
    <Text style={{ fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif' }} className={`font-bold text-[10px] uppercase tracking-widest ${activeTab === id ? 'text-primary' : 'text-stone-400'}`}>{label}</Text>
  </TouchableOpacity>
);

const REGIONAL_SYNONYMS: { [key: string]: string } = {
  'ragi': 'millet',
  'jowar': 'sorghum',
  'besan': 'chickpea flour',
  'maida': 'all purpose flour',
  'atta': 'whole wheat flour',
  'paneer': 'cottage cheese',
  'ghee': 'clarified butter',
  'suji': 'semolina',
  'sooji': 'semolina',
  'khoya': 'milk solids',
  'mawa': 'milk solids',
  'dahi': 'yogurt',
  'elaichi': 'cardamom',
  'jeera': 'cumin',
  'haldi': 'turmeric',
  'methi': 'fenugreek',
  'ajwain': 'carom seeds',
  'hing': 'asafoetida'
};

async function fetchNutritionFromUSDA(query: string): Promise<any[]> {
  const apiKey = 'DEMO_KEY';
  const cleanQuery = query.trim().toLowerCase();
  
  // Try direct search first
  let url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&api_key=${apiKey}`;
  try {
    let response = await fetch(url);
    let data = await response.json();
    if (data.foods && data.foods.length > 0) {
      return data.foods;
    }
  } catch (e) {
    console.error('Direct USDA search failed:', e);
  }
  
  // If not found, check synonyms
  for (const [key, synonym] of Object.entries(REGIONAL_SYNONYMS)) {
    if (cleanQuery.includes(key)) {
      const substituted = cleanQuery.replace(key, synonym);
      url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(substituted)}&api_key=${apiKey}`;
      try {
        let response = await fetch(url);
        let data = await response.json();
        if (data.foods && data.foods.length > 0) {
          return data.foods;
        }
      } catch (e) {
        console.error('Synonym USDA search failed:', e);
      }
    }
  }
  
  return [];
}

function parseUSDANutrients(food: any) {
  const findNutrient = (names: string[], numberIds?: string[]) => {
    const nutrient = food.foodNutrients?.find((n: any) => {
      const name = n.nutrientName || n.nutrient?.name;
      const num = n.nutrientNumber || n.nutrient?.number || n.nutrientId || n.nutrient?.id;
      
      const matchesName = name && names.some(tgt => name.toLowerCase().includes(tgt.toLowerCase()));
      const matchesId = num && numberIds && numberIds.includes(String(num));
      
      return matchesName || matchesId;
    });
    if (nutrient) {
      return nutrient.value !== undefined ? nutrient.value : (nutrient.amount !== undefined ? nutrient.amount : 0);
    }
    return 0;
  };

  return {
    calories: findNutrient(['energy', 'calories', 'kcal'], ['208', '268', '1008']),
    protein: findNutrient(['protein'], ['203', '1003']),
    carbs: findNutrient(['carbohydrate', 'carb'], ['205', '1005']),
    fat: findNutrient(['total lipid', 'fat', 'lipids'], ['204', '1004']),
    sugar: findNutrient(['sugars, total', 'sugar', 'sucrose'], ['269', '2000'])
  };
}

function getMaterialNutritionPortion(amount: number, reqUnit: string, matUnit: string): number {
  const mUnit = (matUnit || 'g').toLowerCase();
  const rUnit = (reqUnit || 'g').toLowerCase();
  
  if (mUnit === 'g' || mUnit === 'kg') {
    const grams = convertAmount(amount, rUnit, 'g');
    return grams / 100;
  }
  if (mUnit === 'ml' || mUnit === 'l') {
    const ml = convertAmount(amount, rUnit, 'ml');
    return ml / 100;
  }
  return convertAmount(amount, rUnit, matUnit);
}

const getNutritionBasisLabel = (unit: string) => {
  const u = (unit || 'g').toLowerCase();
  if (u === 'g' || u === 'kg') return 'per 100g';
  if (u === 'ml' || u === 'l') return 'per 100ml';
  if (u === 'pcs') return 'per piece';
  return 'per piece';
};

const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  g: { g: 1, kg: 0.001 },
  kg: { g: 1000, kg: 1 },
  ml: { ml: 1, l: 0.001 },
  l: { ml: 1000, l: 1 },
  pcs: { pcs: 1 }
};

function convertAmount(amount: number, fromUnit: string, toUnit: string): number {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return amount;
  const conversion = UNIT_CONVERSIONS[fromUnit]?.[toUnit];
  return conversion !== undefined ? amount * conversion : amount;
}

function MainApp({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'menu' | 'orders' | 'experiments' | 'summary' | 'settings'>('inventory');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [materials, setMaterials] = useState<RawMaterial[]>(INITIAL_MATERIALS);
  
  // Edit Material State
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [editableCostIds, setEditableCostIds] = useState<Set<string>>(new Set());

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const editingMenuItemRef = React.useRef(editingMenuItem);
  React.useEffect(() => { editingMenuItemRef.current = editingMenuItem; }, [editingMenuItem]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [editingExperiment, setEditingExperiment] = useState<Experiment | null>(null);

  const [settings, setSettings] = useState<BakerySettings>({ name: 'My Bakery', hasGstNumber: false });
  const [isEditingSettings, setIsEditingSettings] = useState(false);

  const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);

  // Nutrition States
  const [nutritionSearchQuery, setNutritionSearchQuery] = useState('');
  const [nutritionSearchResults, setNutritionSearchResults] = useState<any[]>([]);
  const [isSearchingNutrition, setIsSearchingNutrition] = useState(false);
  const [nutritionError, setNutritionError] = useState<string | null>(null);

  useEffect(() => {
    const unsubMats = onSnapshot(collection(db, 'users', user.uid, 'materials'), (snapshot) => {
      // Skip if local writes are still pending to avoid overwriting optimistic state
      if (snapshot.metadata.hasPendingWrites) return;
      const mats = snapshot.docs.map(d => d.data() as RawMaterial);
      console.log('Mobile onSnapshot triggered for materials. Count:', mats.length);
      if (mats.length > 0) {
        setMaterials(mats);
        setEditableCostIds(prev => {
          const next = new Set(prev);
          mats.forEach(mat => {
            if ((mat.costPerUnit ?? 0) === 0) {
              next.add(mat.id);
            }
          });
          return next;
        });
      } else {
        console.log('No materials returned from Firestore for user:', user.uid);
      }
    }, (err) => console.error('Firestore Error on materials:', err));
    
    const unsubMenu = onSnapshot(collection(db, 'users', user.uid, 'menu'), (snapshot) => {
      // Skip if local writes are still pending to avoid overwriting optimistic state
      if (snapshot.metadata.hasPendingWrites) return;
      const items = snapshot.docs.map(d => d.data() as MenuItem);
      setMenu(items);
    });

    const unsubOrders = onSnapshot(collection(db, 'users', user.uid, 'orders'), (snapshot) => {
      const ords = snapshot.docs.map(d => d.data() as Order);
      setOrders(ords);
    });

    const unsubExperiments = onSnapshot(collection(db, 'users', user.uid, 'experiments'), (snapshot) => {
      const exps = snapshot.docs.map(d => d.data() as Experiment);
      setExperiments(exps);
    });

    const unsubSettings = onSnapshot(doc(db, 'users', user.uid, 'settings', 'bakery'), (docSnap) => {
      if (docSnap.exists()) setSettings({ hasGstNumber: false, ...(docSnap.data() as BakerySettings) });
    });
    
    return () => { unsubMats(); unsubMenu(); unsubOrders(); unsubExperiments(); unsubSettings(); };
  }, [user]);

  const addMaterial = async () => {
    const id = Math.random().toString(36).substr(2, 9);
    const newMat: RawMaterial = {
      id, name: 'New Material', unit: 'g', initialStock: 0, costPerUnit: 0, category: 'Raw Materials', dateAdded: new Date().toISOString()
    };
    setEditableCostIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    await setDoc(doc(db, 'users', user.uid, 'materials', id), newMat);
    setEditingMaterial(newMat);
    setNutritionSearchQuery('New Material');
    setNutritionSearchResults([]);
    setNutritionError(null);
  };

  const saveMaterial = async () => {
    if (!editingMaterial) return;
    await setDoc(doc(db, 'users', user.uid, 'materials', editingMaterial.id), editingMaterial, { merge: true });
    setEditingMaterial(null);
  };

  const [restockMaterial, setRestockMaterial] = useState<RawMaterial | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockBaseTotal, setRestockBaseTotal] = useState('');

  const handleRestock = async () => {
    if (!restockMaterial || !user || !restockQty || !restockBaseTotal) return;
    try {
      const qty = Number(restockQty);
      const baseTotal = Number(restockBaseTotal);
      if (qty <= 0) return;
      
      const newStock = restockMaterial.initialStock + qty;
      const oldTotalValue = restockMaterial.initialStock * restockMaterial.costPerUnit;
      const newMAC = newStock > 0 ? (oldTotalValue + baseTotal) / newStock : 0;

      await setDoc(doc(db, 'users', user.uid, 'materials', restockMaterial.id), {
        initialStock: newStock,
        costPerUnit: newMAC
      }, { merge: true });
      
      setRestockMaterial(null);
      setRestockQty('');
      setRestockBaseTotal('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const deleteMaterial = async (id: string) => {
    await deleteDoc(doc(db, 'users', user.uid, 'materials', id));
  };

  const addMenuItem = async () => {
    const id = Math.random().toString(36).substr(2, 9);
    const newItem: MenuItem = {
      id, name: 'New Item', sellingPrice: 0, recipe: []
    };
    await setDoc(doc(db, 'users', user.uid, 'menu', id), newItem);
    setEditingMenuItem(newItem);
  };

  const saveMenuItem = async () => {
    const itemToSave = editingMenuItemRef.current;
    if (!itemToSave) return;
    await setDoc(doc(db, 'users', user.uid, 'menu', itemToSave.id), itemToSave, { merge: true });
    setEditingMenuItem(null);
  };

  const deleteMenuItem = async (id: string) => {
    await deleteDoc(doc(db, 'users', user.uid, 'menu', id));
  };

  const addOrder = async () => {
    if (menu.length === 0) {
      Alert.alert('No Menu Items', 'Please add some recipes in the Menu tab first.');
      return;
    }
    const id = Math.random().toString(36).substr(2, 9);
    const newOrder: Order = {
      id, menuItemId: menu[0].id, quantity: 1, date: orderDate
    };
    await setDoc(doc(db, 'users', user.uid, 'orders', id), newOrder);
    setEditingOrder(newOrder);
  };

  const saveOrder = async () => {
    if (!editingOrder) return;
    await setDoc(doc(db, 'users', user.uid, 'orders', editingOrder.id), editingOrder, { merge: true });
    setEditingOrder(null);
  };

  const deleteOrder = async (id: string) => {
    await deleteDoc(doc(db, 'users', user.uid, 'orders', id));
  };

  const addExperiment = async () => {
    const id = Math.random().toString(36).substr(2, 9);
    const newExp: Experiment = {
      id, name: 'New Experiment', result: 'pending', notes: '', date: new Date().toISOString().split('T')[0]
    };
    await setDoc(doc(db, 'users', user.uid, 'experiments', id), newExp);
    setEditingExperiment(newExp);
  };

  const saveExperiment = async () => {
    if (!editingExperiment) return;
    await setDoc(doc(db, 'users', user.uid, 'experiments', editingExperiment.id), editingExperiment, { merge: true });
    setEditingExperiment(null);
  };

  const deleteExperiment = async (id: string) => {
    await deleteDoc(doc(db, 'users', user.uid, 'experiments', id));
  };

  const saveSettings = async () => {
    await setDoc(doc(db, 'users', user.uid, 'settings', 'bakery'), settings, { merge: true });
    setIsEditingSettings(false);
  };

  const screenWidth = Dimensions.get("window").width;

  return (
    <View className="flex-1 relative bg-surface">
      {/* Header */}
      <SafeAreaView className="bg-[#FDFCFB] border-b border-stone-200/50">
        <View className="px-6 py-4 flex-row justify-between items-center">
          <View className="flex-row items-center gap-3">
            {settings.logo ? (
              <View className="relative">
                <Image source={{ uri: settings.logo }} className="w-10 h-10 rounded-2xl border border-stone-200" />
              </View>
            ) : (
              <View className="bg-primary p-2.5 rounded-2xl shadow-md shadow-primary/20 justify-center items-center">
                <ChefHat size={20} color="#fff" />
              </View>
            )}
            <View>
              <Text className="text-base font-bold text-stone-900 leading-tight">{settings.name || 'Bakery Tracker'}</Text>
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <Text className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Live Dashboard</Text>
              </View>
            </View>
          </View>

          <View className="flex-row items-center gap-3">
            <View className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 items-center justify-center">
              <Text className="text-primary font-bold text-xs uppercase">{user?.email?.charAt(0) || 'B'}</Text>
            </View>
            <TouchableOpacity 
              onPress={() => {
                Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign Out', style: 'destructive', onPress: () => signOut(auth) }
                ]);
              }} 
              className="p-2 bg-stone-100 rounded-xl"
            >
              <LogOut size={14} color="#f43f5e" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Scrollable Horizontal Navigation Tab Bar */}
        <View className="border-t border-stone-200/30">
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            className="flex-row px-4"
            contentContainerStyle={{ gap: 4 }}
          >
            <TabButton id="inventory" activeTab={activeTab} setActiveTab={setActiveTab} label="Inventory" icon={PackageSearch} />
            <TabButton id="menu" activeTab={activeTab} setActiveTab={setActiveTab} label="Recipes" icon={ChefHat} />
            <TabButton id="orders" activeTab={activeTab} setActiveTab={setActiveTab} label="Daily Orders" icon={ClipboardList} />
            <TabButton id="experiments" activeTab={activeTab} setActiveTab={setActiveTab} label="Experiments" icon={FlaskConical} />
            <TabButton id="summary" activeTab={activeTab} setActiveTab={setActiveTab} label="Summary" icon={Calculator} />
            <TabButton id="settings" activeTab={activeTab} setActiveTab={setActiveTab} label="Settings" icon={SettingsIcon} />
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Editing Modal - Material */}
      <Modal visible={!!editingMaterial} animationType="slide" presentationStyle="pageSheet" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-stone-900/40">
          <View className="bg-white p-6 rounded-t-[2.5rem] shadow-xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-stone-800">Edit Material</Text>
              <TouchableOpacity onPress={() => setEditingMaterial(null)} className="p-2 bg-stone-100 rounded-full">
                <X size={20} color="#78716c" />
              </TouchableOpacity>
            </View>

            {editingMaterial && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Name</Text>
                <TextInput 
                  value={editingMaterial.name}
                  onChangeText={(text) => setEditingMaterial({...editingMaterial, name: text})}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-4 text-stone-800 font-bold"
                />

                <View className="mb-4">
                  <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Stock Amount</Text>
                  <TextInput 
                    value={String(editingMaterial.initialStock)}
                    onChangeText={(text) => setEditingMaterial({...editingMaterial, initialStock: parseFloat(text) || 0})}
                    keyboardType="numeric"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                  />
                </View>

                <View className="mb-4 relative">
                  <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Unit</Text>
                  <TouchableOpacity 
                    onPress={() => setIsUnitDropdownOpen(true)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 flex-row justify-between items-center"
                  >
                    <Text className="text-stone-800 font-bold uppercase">{
                      editingMaterial.unit === 'g' ? 'Grams (g)' : 
                      editingMaterial.unit === 'kg' ? 'Kilograms (kg)' : 
                      editingMaterial.unit === 'ml' ? 'Millilitres (ml)' : 
                      editingMaterial.unit === 'l' ? 'Litres (l)' : 
                      editingMaterial.unit === 'pcs' ? 'Pieces (pcs)' : editingMaterial.unit
                    }</Text>
                    <ChevronDown size={20} color="#78716c" />
                  </TouchableOpacity>

                  {/* Dropdown Modal overlay */}
                  <Modal visible={isUnitDropdownOpen} transparent animationType="fade">
                    <TouchableOpacity 
                      style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center'}}
                      activeOpacity={1}
                      onPress={() => setIsUnitDropdownOpen(false)}
                    >
                      <View className="bg-white w-[80%] rounded-2xl p-6 shadow-2xl">
                        <Text className="text-xl font-bold text-stone-800 mb-6 text-center">Select Unit</Text>
                        {[
                          { val: 'g', label: 'Grams (g)' },
                          { val: 'kg', label: 'Kilograms (kg)' },
                          { val: 'ml', label: 'Millilitres (ml)' },
                          { val: 'l', label: 'Litres (l)' },
                          { val: 'pcs', label: 'Pieces (pcs)' }
                        ].map(u => (
                          <TouchableOpacity 
                            key={u.val}
                            onPress={() => {
                              setEditingMaterial({...editingMaterial, unit: u.val});
                              setIsUnitDropdownOpen(false);
                            }}
                            className={`p-4 rounded-xl mb-3 ${editingMaterial.unit === u.val ? 'bg-[#F9F5F0] border border-primary' : 'bg-stone-50 border border-stone-200'}`}
                          >
                            <Text className={`font-bold text-center text-base ${editingMaterial.unit === u.val ? 'text-primaryDark' : 'text-stone-600'}`}>{u.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </TouchableOpacity>
                  </Modal>
                </View>

                <View className="flex-row gap-4 mb-8">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">MAC / Unit</Text>
                    <TextInput 
                      value={editingMaterial.costPerUnit === 0 ? '' : String(editingMaterial.costPerUnit)}
                      placeholder="0.00"
                      editable={editableCostIds.has(editingMaterial.id)}
                      onChangeText={(text) => setEditingMaterial({...editingMaterial, costPerUnit: parseFloat(text) || 0})}
                      keyboardType="numeric"
                      className={`w-full border rounded-xl px-4 py-3 font-bold ${
                        !editableCostIds.has(editingMaterial.id)
                          ? "bg-stone-100 border-stone-200 text-stone-400 opacity-70"
                          : "bg-stone-50 border-stone-200 text-stone-800"
                      }`}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Threshold %</Text>
                    <TextInput 
                      value={String(editingMaterial.threshold || 0)}
                      onChangeText={(text) => setEditingMaterial({...editingMaterial, threshold: parseFloat(text) || 0})}
                      keyboardType="numeric"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                    />
                  </View>
                </View>

                <View className="flex-row gap-4 mb-8">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">GST Rate %</Text>
                    <TextInput 
                      value={String(editingMaterial.gstRate ?? 5)}
                      onChangeText={(text) => setEditingMaterial({...editingMaterial, gstRate: parseFloat(text) || 0})}
                      keyboardType="numeric"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                    />
                  </View>
                </View>

                {/* Nutrition Facts section */}
                <View className="border-t border-stone-200 pt-6 mb-6">
                  <View className="flex-row items-center mb-4">
                    <Text className="text-sm font-bold text-stone-800 uppercase tracking-widest ml-1">Nutrition Facts</Text>
                  </View>
                  <Text className="text-stone-400 text-xs italic mb-4 ml-1">
                    Set nutritional values {getNutritionBasisLabel(editingMaterial.unit)} of this ingredient.
                  </Text>

                  {/* Search Online */}
                  <View className="bg-stone-50 p-4 rounded-2xl border border-stone-200/50 mb-6">
                    <Text className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 ml-1">Search Online Database</Text>
                    <View className="flex-row gap-2">
                      <TextInput
                        value={nutritionSearchQuery}
                        onChangeText={setNutritionSearchQuery}
                        placeholder="e.g. Ragi flour, almonds..."
                        className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-800 text-sm"
                      />
                      <TouchableOpacity
                        disabled={isSearchingNutrition || !nutritionSearchQuery}
                        onPress={async () => {
                          setIsSearchingNutrition(true);
                          setNutritionError(null);
                          try {
                            const results = await fetchNutritionFromUSDA(nutritionSearchQuery);
                            setNutritionSearchResults(results);
                            if (results.length === 0) {
                              setNutritionError("No results found.");
                            }
                          } catch (err) {
                            setNutritionError("Failed to fetch nutrition data.");
                          } finally {
                            setIsSearchingNutrition(false);
                          }
                        }}
                        className="bg-primary px-4 justify-center items-center rounded-xl active:scale-[0.98] disabled:opacity-50"
                      >
                        {isSearchingNutrition ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="text-white font-bold text-xs uppercase tracking-wider">Search</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    
                    {nutritionError && <Text className="text-rose-500 text-xs mt-2 ml-1">{nutritionError}</Text>}

                    {/* Search Results list */}
                    {nutritionSearchResults.length > 0 && (
                      <View className="mt-3 max-h-40 border border-stone-200 rounded-xl bg-white overflow-hidden divide-y divide-stone-100">
                        {nutritionSearchResults.slice(0, 5).map((food: any) => (
                          <TouchableOpacity
                            key={food.fdcId}
                            onPress={() => {
                              const parsed = parseUSDANutrients(food);
                              setEditingMaterial({
                                ...editingMaterial,
                                calories: parsed.calories,
                                protein: parsed.protein,
                                carbs: parsed.carbs,
                                fat: parsed.fat,
                                sugar: parsed.sugar
                              });
                              setNutritionSearchResults([]);
                            }}
                            className="p-3 bg-white border-b border-stone-100 active:bg-stone-150"
                          >
                            <Text className="font-bold text-stone-700 text-xs">{food.description}</Text>
                            <Text className="text-[10px] text-stone-400 mt-0.5">{food.foodCategory || 'Generic'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Manual Inputs Grid */}
                  <View className="flex-row gap-4 mb-4">
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Calories (kcal) {getNutritionBasisLabel(editingMaterial.unit)}</Text>
                      <TextInput
                        value={editingMaterial.calories !== undefined ? String(editingMaterial.calories) : ''}
                        onChangeText={(text) => setEditingMaterial({ ...editingMaterial, calories: parseFloat(text) || 0 })}
                        keyboardType="numeric"
                        placeholder="0.0"
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Protein (g) {getNutritionBasisLabel(editingMaterial.unit)}</Text>
                      <TextInput
                        value={editingMaterial.protein !== undefined ? String(editingMaterial.protein) : ''}
                        onChangeText={(text) => setEditingMaterial({ ...editingMaterial, protein: parseFloat(text) || 0 })}
                        keyboardType="numeric"
                        placeholder="0.0"
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                      />
                    </View>
                  </View>

                  <View className="flex-row gap-4 mb-4">
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Carbs (g) {getNutritionBasisLabel(editingMaterial.unit)}</Text>
                      <TextInput
                        value={editingMaterial.carbs !== undefined ? String(editingMaterial.carbs) : ''}
                        onChangeText={(text) => setEditingMaterial({ ...editingMaterial, carbs: parseFloat(text) || 0 })}
                        keyboardType="numeric"
                        placeholder="0.0"
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Fats (g) {getNutritionBasisLabel(editingMaterial.unit)}</Text>
                      <TextInput
                        value={editingMaterial.fat !== undefined ? String(editingMaterial.fat) : ''}
                        onChangeText={(text) => setEditingMaterial({ ...editingMaterial, fat: parseFloat(text) || 0 })}
                        keyboardType="numeric"
                        placeholder="0.0"
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                      />
                    </View>
                  </View>

                  <View className="mb-6">
                    <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Sugar (g) {getNutritionBasisLabel(editingMaterial.unit)}</Text>
                    <TextInput
                      value={editingMaterial.sugar !== undefined ? String(editingMaterial.sugar) : ''}
                      onChangeText={(text) => setEditingMaterial({ ...editingMaterial, sugar: parseFloat(text) || 0 })}
                      keyboardType="numeric"
                      placeholder="0.0"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                    />
                  </View>
                </View>

                <TouchableOpacity 
                  onPress={() => {
                    setRestockMaterial(editingMaterial);
                    setEditingMaterial(null);
                  }}
                  className="w-full bg-[#F9F5F0] border border-primaryLight py-4 rounded-xl flex-row justify-center items-center shadow-sm active:scale-[0.98] mb-4"
                >
                  <Plus size={20} color="#8B5E3C" />
                  <Text className="font-bold text-primary text-base ml-2">Restock Material</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={saveMaterial}
                  className="w-full bg-primary py-4 rounded-xl flex-row justify-center items-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                >
                  <Save size={20} color="#fff" />
                  <Text className="font-bold text-white text-base ml-2">Save Changes</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Restock Modal */}
      <Modal visible={!!restockMaterial} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-stone-900/40">
          <View className="bg-white rounded-t-[2rem] p-6 max-h-[90%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-stone-800 tracking-tight">Restock {restockMaterial?.name}</Text>
              <TouchableOpacity onPress={() => setRestockMaterial(null)} className="p-2 bg-stone-100 rounded-full">
                <X size={20} color="#78716c" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="mb-4">
                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Quantity Added ({restockMaterial?.unit})</Text>
                <TextInput 
                  value={restockQty}
                  onChangeText={setRestockQty}
                  keyboardType="numeric"
                  placeholder="e.g. 5000"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                />
              </View>

              <View className="mb-6">
                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Total Base Price Paid</Text>
                <TextInput 
                  value={restockBaseTotal}
                  onChangeText={setRestockBaseTotal}
                  keyboardType="numeric"
                  placeholder="0.00"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-bold"
                />
              </View>

              <View className="p-4 bg-stone-50 rounded-xl border border-stone-100 flex-row justify-between items-center mb-2">
                <Text className="text-xs font-bold text-stone-500 uppercase tracking-widest">GST ({restockMaterial?.gstRate ?? 5}%)</Text>
                <Text className="text-sm font-mono font-bold text-stone-700">
                  {restockBaseTotal ? (Number(restockBaseTotal) * ((restockMaterial?.gstRate ?? 5) / 100)).toFixed(2) : '0.00'}
                </Text>
              </View>

              <View className="p-4 bg-[#F9F5F0] rounded-xl border border-[#8B5E3C]/20 flex-row justify-between items-center mb-8">
                <Text className="text-xs font-bold text-primaryDark uppercase tracking-widest">Total Paid</Text>
                <Text className="text-lg font-mono font-bold text-primaryDark">
                  {restockBaseTotal ? (Number(restockBaseTotal) * (1 + ((restockMaterial?.gstRate ?? 5) / 100))).toFixed(2) : '0.00'}
                </Text>
              </View>

              <TouchableOpacity 
                onPress={handleRestock}
                className="w-full bg-primary py-4 rounded-xl flex-row justify-center items-center shadow-lg shadow-primary/20 active:scale-[0.98]"
              >
                <Text className="font-bold text-white text-base ml-2">Confirm Restock</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Editing Modal - Menu Item */}
      <Modal visible={!!editingMenuItem} animationType="slide" presentationStyle="pageSheet" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-stone-900/40">
          <View className="bg-white p-6 rounded-t-[2.5rem] shadow-xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-stone-800">Edit Menu Item</Text>
              <TouchableOpacity onPress={() => setEditingMenuItem(null)} className="p-2 bg-stone-100 rounded-full">
                <X size={20} color="#78716c" />
              </TouchableOpacity>
            </View>

            {editingMenuItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Name</Text>
                <TextInput 
                  value={editingMenuItem.name}
                  onChangeText={(text) => setEditingMenuItem({...editingMenuItem, name: text})}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-4 text-stone-800 font-bold"
                />

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Selling Price</Text>
                <TextInput 
                  value={String(editingMenuItem.sellingPrice)}
                  onChangeText={(text) => setEditingMenuItem({...editingMenuItem, sellingPrice: parseFloat(text) || 0})}
                  keyboardType="numeric"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-4 text-stone-800 font-bold"
                />

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Servings</Text>
                <MobileServingsInput 
                  value={editingMenuItem.servings ?? 1}
                  onChange={(val) => setEditingMenuItem({...editingMenuItem, servings: val})}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-6 text-stone-800 font-bold"
                />

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 ml-1">Recipe Ingredients</Text>
                {editingMenuItem.recipe.map((req, idx) => {
                  const mat = materials.find(m => m.id === req.materialId);
                  return (
                    <View key={idx} className="flex-row items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-3 mb-2">
                      <Text className="font-bold text-stone-700 flex-1">{mat?.name || 'Unknown'}</Text>
                      <TextInput 
                        value={String(req.amount)}
                        onChangeText={(text) => {
                          const newRecipe = [...editingMenuItem.recipe];
                          newRecipe[idx] = { ...req, amount: parseFloat(text) || 0 };
                          setEditingMenuItem({...editingMenuItem, recipe: newRecipe});
                        }}
                        keyboardType="numeric"
                        className="w-20 bg-white border border-stone-200 rounded-lg px-2 py-1 text-center font-bold text-stone-800 mr-2"
                      />
                      <Text className="text-xs text-stone-400 font-bold uppercase tracking-wider w-8">{req.unit}</Text>
                      <TouchableOpacity 
                        onPress={() => {
                          const newRecipe = [...editingMenuItem.recipe];
                          newRecipe.splice(idx, 1);
                          setEditingMenuItem({...editingMenuItem, recipe: newRecipe});
                        }}
                        className="p-1 ml-2 bg-rose-50 rounded-lg"
                      >
                        <Trash2 size={16} color="#f43f5e" />
                      </TouchableOpacity>
                    </View>
                  );
                })}

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mt-4 mb-2 ml-1">Add Ingredient</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-8 flex-row">
                  {materials.filter(m => !editingMenuItem.recipe.find(req => req.materialId === m.id)).map(mat => (
                    <TouchableOpacity 
                      key={mat.id}
                      onPress={() => {
                        const newRecipe = [...(editingMenuItem.recipe || []), { materialId: mat.id, amount: 0, unit: mat.unit }];
                        setEditingMenuItem({...editingMenuItem, recipe: newRecipe});
                      }}
                      className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 mr-2 flex-row items-center"
                    >
                      <Plus size={14} color="#8B5E3C" />
                      <Text className="font-bold text-stone-600 ml-1">{mat.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {materials.filter(m => !editingMenuItem.recipe.find(req => req.materialId === m.id)).length === 0 && (
                    <Text className="text-xs text-stone-400 italic py-2">All materials added or none available.</Text>
                  )}
                </ScrollView>

                {/* Nutrition Facts section */}
                {(() => {
                  let calories = 0;
                  let protein = 0;
                  let carbs = 0;
                  let fat = 0;
                  let sugar = 0;

                  editingMenuItem.recipe.forEach(req => {
                    const mat = materials.find(m => m.id === req.materialId);
                    if (!mat) return;
                    if (mat.category === 'Packaging Materials') return;

                    const portion = getMaterialNutritionPortion(req.amount, req.unit || 'g', mat.unit);

                    calories += portion * (mat.calories ?? 0);
                    protein += portion * (mat.protein ?? 0);
                    carbs += portion * (mat.carbs ?? 0);
                    fat += portion * (mat.fat ?? 0);
                    sugar += portion * (mat.sugar ?? 0);
                  });

                  const servings = editingMenuItem.servings || 1;
                  const nutrition = {
                    calories: calories / servings,
                    protein: protein / servings,
                    carbs: carbs / servings,
                    fat: fat / servings,
                    sugar: sugar / servings
                  };

                  const isNutritionConfigured = nutrition.calories > 0 || nutrition.protein > 0 || nutrition.carbs > 0 || nutrition.fat > 0 || nutrition.sugar > 0;

                  return (
                    <View className="bg-stone-50 border border-stone-200 rounded-2xl p-4 mb-6">
                      <View className="flex-row justify-between items-center border-b border-stone-200 pb-2 mb-3">
                        <Text className="text-xs font-bold text-stone-700 uppercase tracking-wider">Nutrition Facts</Text>
                        <Text className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Per Serving ({servings} serving{servings > 1 ? 's' : ''}/recipe)</Text>
                      </View>
                      
                      {!isNutritionConfigured ? (
                        <Text className="text-stone-400 text-xs italic text-center py-2">
                          Configure ingredient nutrition in the Inventory tab to see calculations.
                        </Text>
                      ) : (
                        <View className="flex-row justify-between">
                          <View className="items-center flex-1">
                            <Text className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Calories</Text>
                            <Text className="text-xs font-bold text-stone-700 mt-1">{nutrition.calories.toFixed(0)} kcal</Text>
                          </View>
                          <View className="items-center flex-1 border-l border-stone-200">
                            <Text className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Carbs</Text>
                            <Text className="text-xs font-bold text-stone-700 mt-1">{nutrition.carbs.toFixed(1)}g</Text>
                          </View>
                          <View className="items-center flex-1 border-l border-stone-200">
                            <Text className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Sugar</Text>
                            <Text className="text-xs font-bold text-stone-700 mt-1">{nutrition.sugar.toFixed(1)}g</Text>
                          </View>
                          <View className="items-center flex-1 border-l border-stone-200">
                            <Text className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Protein</Text>
                            <Text className="text-xs font-bold text-stone-700 mt-1">{nutrition.protein.toFixed(1)}g</Text>
                          </View>
                          <View className="items-center flex-1 border-l border-stone-200">
                            <Text className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Fat</Text>
                            <Text className="text-xs font-bold text-stone-700 mt-1">{nutrition.fat.toFixed(1)}g</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

                <TouchableOpacity 
                  onPress={saveMenuItem}
                  className="w-full bg-primary py-4 rounded-xl flex-row justify-center items-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                >
                  <Save size={20} color="#fff" />
                  <Text className="font-bold text-white text-base ml-2">Save Changes</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Editing Modal - Order */}
      <Modal visible={!!editingOrder} animationType="slide" presentationStyle="pageSheet" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-stone-900/40">
          <View className="bg-white p-6 rounded-t-[2.5rem] shadow-xl max-h-[80%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-stone-800">Edit Order</Text>
              <TouchableOpacity onPress={() => setEditingOrder(null)} className="p-2 bg-stone-100 rounded-full">
                <X size={20} color="#78716c" />
              </TouchableOpacity>
            </View>

            {editingOrder && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Quantity</Text>
                <TextInput 
                  value={editingOrder.quantity === 0 ? '' : String(editingOrder.quantity)}
                  onChangeText={(text) => {
                    const val = text.replace(/[^0-9]/g, '');
                    setEditingOrder({...editingOrder, quantity: val === '' ? 0 : parseInt(val)});
                  }}
                  keyboardType="numeric"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-4 text-stone-800 font-bold"
                />

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Customer Name</Text>
                <TextInput 
                  value={editingOrder.customerName || ''}
                  onChangeText={(text) => setEditingOrder({...editingOrder, customerName: text})}
                  placeholder="Optional"
                  placeholderTextColor="#a8a29e"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-4 text-stone-800 font-bold"
                />

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Customer Phone</Text>
                <TextInput 
                  value={editingOrder.customerPhone || ''}
                  onChangeText={(text) => setEditingOrder({...editingOrder, customerPhone: text})}
                  placeholder="Optional"
                  placeholderTextColor="#a8a29e"
                  keyboardType="phone-pad"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-6 text-stone-800 font-bold"
                />

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 ml-1">Select Menu Item</Text>
                <View className="flex-row flex-wrap gap-2 mb-8">
                  {menu.map(item => (
                    <TouchableOpacity 
                      key={item.id}
                      onPress={() => setEditingOrder({...editingOrder, menuItemId: item.id})}
                      className={`px-4 py-2 rounded-xl border ${editingOrder.menuItemId === item.id ? 'bg-primary border-primaryDark' : 'bg-stone-50 border-stone-200'}`}
                    >
                      <Text className={`font-bold ${editingOrder.menuItemId === item.id ? 'text-white' : 'text-stone-600'}`}>{item.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity 
                  onPress={saveOrder}
                  className="w-full bg-primary py-4 rounded-xl flex-row justify-center items-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                >
                  <Save size={20} color="#fff" />
                  <Text className="font-bold text-white text-base ml-2">Save Changes</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Editing Modal - Experiment */}
      <Modal visible={!!editingExperiment} animationType="slide" presentationStyle="pageSheet" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-stone-900/40">
          <View className="bg-white p-6 rounded-t-[2.5rem] shadow-xl max-h-[80%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-stone-800">Edit Experiment</Text>
              <TouchableOpacity onPress={() => setEditingExperiment(null)} className="p-2 bg-stone-100 rounded-full">
                <X size={20} color="#78716c" />
              </TouchableOpacity>
            </View>

            {editingExperiment && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Name / Objective</Text>
                <TextInput 
                  value={editingExperiment.name}
                  onChangeText={(text) => setEditingExperiment({...editingExperiment, name: text})}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-4 text-stone-800 font-bold"
                />

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Result Status</Text>
                <View className="flex-row gap-2 mb-4">
                  {(['pending', 'success', 'failure'] as const).map(res => (
                    <TouchableOpacity 
                      key={res}
                      onPress={() => setEditingExperiment({...editingExperiment, result: res})}
                      className={`flex-1 items-center px-2 py-3 rounded-xl border ${editingExperiment.result === res ? 'bg-[#F9F5F0] border-primary' : 'bg-stone-50 border-stone-200'}`}
                    >
                      <Text className={`font-bold capitalize ${editingExperiment.result === res ? 'text-primaryDark' : 'text-stone-500'}`}>{res}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Notes</Text>
                <TextInput 
                  value={editingExperiment.notes}
                  onChangeText={(text) => setEditingExperiment({...editingExperiment, notes: text})}
                  multiline
                  numberOfLines={4}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-8 text-stone-800 font-medium text-left align-top h-32"
                />

                <TouchableOpacity 
                  onPress={saveExperiment}
                  className="w-full bg-primary py-4 rounded-xl flex-row justify-center items-center shadow-lg shadow-primary/20 active:scale-[0.98]"
                >
                  <Save size={20} color="#fff" />
                  <Text className="font-bold text-white text-base ml-2">Save Changes</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Content */}
      <ScrollView className="flex-1 p-6">
        {activeTab === 'inventory' && (
          <View>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-lg font-bold text-stone-800">Raw Materials</Text>
              <TouchableOpacity onPress={addMaterial} className="flex-row items-center bg-primary px-4 py-2 rounded-xl shadow-sm shadow-primary/20 active:scale-[0.98]">
                <Plus size={14} color="#fff" />
                <Text className="text-white font-bold text-xs ml-2">Add Item</Text>
              </TouchableOpacity>
            </View>

            {materials.map(mat => (
              <TouchableOpacity 
                key={mat.id} 
                onPress={() => {
                  setEditingMaterial(mat);
                  setNutritionSearchQuery(mat.name);
                  setNutritionSearchResults([]);
                  setNutritionError(null);
                }}
                className="bg-white p-5 rounded-[2rem] mb-4 border border-stone-100/70 flex-row justify-between items-center shadow-sm"
              >
                <View>
                  <Text className="font-bold text-stone-800 text-base">{mat.name}</Text>
                  <Text className="text-stone-400 text-xs mt-1">Stock: {mat.initialStock} {mat.unit}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteMaterial(mat.id)} className="p-2 bg-rose-50 rounded-full">
                  <Trash2 size={16} color="#f43f5e" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'menu' && (
          <View>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-lg font-bold text-stone-800">Menu & Recipes</Text>
              <TouchableOpacity onPress={addMenuItem} className="flex-row items-center bg-primary px-4 py-2 rounded-xl shadow-sm shadow-primary/20 active:scale-[0.98]">
                <Plus size={14} color="#fff" />
                <Text className="text-white font-bold text-xs ml-2">Add Item</Text>
              </TouchableOpacity>
            </View>

            {menu.map(item => (
              <TouchableOpacity 
                key={item.id} 
                onPress={() => setEditingMenuItem(item)}
                className="bg-white p-5 rounded-[2rem] mb-4 border border-stone-100/70 flex-row justify-between items-center shadow-sm"
              >
                <View className="flex-row items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-[#F9F5F0] items-center justify-center mr-3">
                    <ChefHat size={20} color="#8B5E3C" />
                  </View>
                  <View>
                    <Text className="font-bold text-stone-800 text-base">{item.name}</Text>
                    <Text className="text-stone-400 text-xs mt-1">Price: {item.sellingPrice.toFixed(2)}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => deleteMenuItem(item.id)} className="p-2 bg-rose-50 rounded-full ml-2">
                  <Trash2 size={16} color="#f43f5e" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            
            {menu.length === 0 && (
              <View className="flex-1 justify-center items-center py-20">
                <ChefHat size={48} color="#d6d3d1" />
                <Text className="text-stone-400 mt-4 font-bold text-center">No menu items yet.</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'orders' && (
          <View>
            <View className="flex-row justify-between items-center mb-6">
              <View>
                <Text className="text-lg font-bold text-stone-800">Daily Orders</Text>
                <Text className="text-stone-400 text-xs mt-1">{orderDate}</Text>
              </View>
              <TouchableOpacity onPress={addOrder} className="flex-row items-center bg-primary px-4 py-2 rounded-xl shadow-sm shadow-primary/20 active:scale-[0.98]">
                <Plus size={14} color="#fff" />
                <Text className="text-white font-bold text-xs ml-2">Add Order</Text>
              </TouchableOpacity>
            </View>

            {orders.filter(o => o.date === orderDate).map(order => {
              const menuItem = menu.find(m => m.id === order.menuItemId);
              return (
                <TouchableOpacity 
                  key={order.id} 
                  onPress={() => setEditingOrder(order)}
                  className="bg-white p-5 rounded-[2rem] mb-4 border border-stone-100/70 flex-row justify-between items-center shadow-sm"
                >
                  <View className="flex-row items-center flex-1">
                    <View className="w-10 h-10 rounded-full bg-[#F9F5F0] items-center justify-center mr-3">
                      <ClipboardList size={20} color="#8B5E3C" />
                    </View>
                    <View>
                      <Text className="text-base font-bold text-stone-800">{menuItem?.name || 'Unknown'}</Text>
                      <View className="flex-row items-center mt-0.5">
                        <Text className="text-xs text-stone-500 font-medium">Qty: {order.quantity}</Text>
                        {order.customerName && (
                          <>
                            <Text className="text-xs text-stone-300 mx-2">•</Text>
                            <Text className="text-xs text-stone-500 font-medium">{order.customerName}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => deleteOrder(order.id)} className="p-2 bg-rose-50 rounded-full ml-2">
                    <Trash2 size={16} color="#f43f5e" />
                  </TouchableOpacity>
                </TouchableOpacity>
              )
            })}
            
            {orders.filter(o => o.date === orderDate).length === 0 && (
              <View className="flex-1 justify-center items-center py-20">
                <ClipboardList size={48} color="#d6d3d1" />
                <Text className="text-stone-400 mt-4 font-bold text-center">No orders for today yet.</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'experiments' && (
          <View>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-lg font-bold text-stone-800">Experiments Lab</Text>
              <TouchableOpacity onPress={addExperiment} className="flex-row items-center bg-primary px-4 py-2 rounded-xl shadow-sm shadow-primary/20 active:scale-[0.98]">
                <Plus size={14} color="#fff" />
                <Text className="text-white font-bold text-xs ml-2">New Test</Text>
              </TouchableOpacity>
            </View>

            {experiments.map(exp => (
              <TouchableOpacity 
                key={exp.id} 
                onPress={() => setEditingExperiment(exp)}
                className="bg-white p-5 rounded-[2rem] mb-4 border border-stone-100/70 flex-row justify-between items-start shadow-sm"
              >
                <View className="flex-row items-start flex-1">
                  <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 mt-1 ${exp.result === 'success' ? 'bg-[#F9F5F0]' : exp.result === 'failure' ? 'bg-rose-50' : 'bg-amber-50'}`}>
                    <FlaskConical size={20} color={exp.result === 'success' ? '#8B5E3C' : exp.result === 'failure' ? '#f43f5e' : '#f59e0b'} />
                  </View>
                  <View className="flex-1 pr-4">
                    <Text className="font-bold text-stone-800 text-base">{exp.name}</Text>
                    <Text className="text-stone-400 text-xs mt-1" numberOfLines={2}>{exp.notes || 'No notes.'}</Text>
                    <Text className={`text-[10px] uppercase font-bold mt-2 ${exp.result === 'success' ? 'text-primary' : exp.result === 'failure' ? 'text-rose-500' : 'text-amber-500'}`}>
                      {exp.result}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => deleteExperiment(exp.id)} className="p-2 bg-rose-50 rounded-full ml-2">
                  <Trash2 size={16} color="#f43f5e" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            
            {experiments.length === 0 && (
              <View className="flex-1 justify-center items-center py-20">
                <FlaskConical size={48} color="#d6d3d1" />
                <Text className="text-stone-400 mt-4 font-bold text-center">No experiments recorded.</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'summary' && (
          <View>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-lg font-bold text-stone-800">Financial Summary</Text>
            </View>
            
            <View className="bg-white p-6 rounded-[2rem] border border-stone-100 shadow-sm mb-6">
              <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Total Revenue (Incl. 5% GST)</Text>
              <LineChart
                data={{
                  labels: ["D-6", "D-5", "D-4", "D-3", "D-2", "D-1", "Tdy"],
                  datasets: [
                    {
                      data: [0, 0, 12, 45, 20, 60, orders.reduce((sum, o) => {
                        const mInfo = menu.find(m => m.id === o.menuItemId);
                        const basePrice = o.quantity * (mInfo?.sellingPrice || 0);
                        const withGst = basePrice * 1.05;
                        return sum + withGst;
                      }, 0)]
                    }
                  ]
                }}
                width={screenWidth - 96}
                height={220}
                yAxisLabel="$"
                chartConfig={{
                  backgroundColor: "#fff",
                  backgroundGradientFrom: "#fff",
                  backgroundGradientTo: "#fff",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(139, 94, 60, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(120, 113, 108, ${opacity})`,
                  style: { borderRadius: 16 },
                  propsForDots: { r: "4", strokeWidth: "2", stroke: "#8B5E3C" }
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16, alignSelf: 'center' }}
              />
            </View>
          </View>
        )}

        {activeTab === 'settings' && (
          <View>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-lg font-bold text-stone-800">Bakery Settings</Text>
            </View>

            <View className="bg-white p-6 rounded-[2rem] shadow-sm border border-stone-100">
              <View className="items-center mb-6">
                <View className="w-24 h-24 bg-stone-100 rounded-full items-center justify-center mb-4">
                  <ChefHat size={40} color="#a8a29e" />
                </View>
                {isEditingSettings ? (
                  <TouchableOpacity onPress={saveSettings} className="bg-[#F9F5F0] px-4 py-2 rounded-xl">
                    <Text className="font-bold text-primary text-xs">Save Name</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setIsEditingSettings(true)} className="bg-stone-50 px-4 py-2 rounded-xl">
                    <Text className="font-bold text-stone-600 text-xs">Edit Name</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">Bakery Name</Text>
              <TextInput 
                value={settings.name}
                onChangeText={(text) => setSettings({...settings, name: text})}
                editable={isEditingSettings}
                className={`w-full border rounded-xl px-4 py-3 mb-4 font-bold ${isEditingSettings ? 'bg-stone-50 border-primary text-stone-800' : 'bg-transparent border-stone-200 text-stone-500'}`}
              />

              <View className="flex-row items-center justify-between mt-2 mb-4 bg-stone-50 border border-stone-100 p-4 rounded-xl">
                <View className="flex-1 mr-4">
                  <Text className="text-sm font-bold text-stone-800">GST Registered Business</Text>
                  <Text className="text-[10px] text-stone-500 mt-1">Enable to calculate GST on orders and restocks.</Text>
                </View>
                <Switch
                  value={settings.hasGstNumber ?? false}
                  onValueChange={(val) => {
                    if (isEditingSettings) setSettings({...settings, hasGstNumber: val});
                  }}
                  disabled={!isEditingSettings}
                  trackColor={{ false: '#d6d3d1', true: '#8B5E3C' }}
                  thumbColor={settings.hasGstNumber ? '#ffffff' : '#f5f5f4'}
                />
              </View>

              <View className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex-row items-center mt-2">
                <AlertCircle size={20} color="#f97316" />
                <Text className="text-orange-800 text-xs font-bold ml-2">For custom categories, use the Dashboard.</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
