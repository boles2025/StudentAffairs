/**
 * Firebase Realtime Database Service
 * إدارة الاتصال بقاعدة البيانات وقراءة وتحديث بيانات ممثلي الجامعات
 */

const firebaseConfig = {
  apiKey: "AIzaSyDkqqU_3KbEW_FFFK-Sy8QASI0-jsAfycM",
  authDomain: "health-ea6cd.firebaseapp.com",
  databaseURL: "https://health-ea6cd-default-rtdb.firebaseio.com",
  projectId: "health-ea6cd",
  storageBucket: "health-ea6cd.firebasestorage.app",
  messagingSenderId: "836059005460",
  appId: "1:836059005460:web:9d3768d1925288322e9d01"
};

class FirebaseService {
  constructor() {
    this.isInitialized = false;
    this.db = null;
    this.ref = null;
    this.isOnline = navigator.onLine;
    this.listeners = [];
    this.fallbackStorageKey = "lotus_representatives_data";

    this.init();
  }

  init() {
    try {
      if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        this.db = firebase.database();
        this.ref = this.db.ref('university_representatives');
        this.isInitialized = true;
        console.log("Firebase Realtime Database initialized successfully.");
      } else {
        console.warn("Firebase SDK not loaded, working in local mode.");
      }
    } catch (error) {
      console.error("Firebase initialization failed:", error);
    }
  }

  // الحصول على البيانات المخزنة محلياً كنسخة احتياطية
  getLocalData() {
    try {
      const data = localStorage.getItem(this.fallbackStorageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  // حفظ البيانات محلياً كنسخة احتياطية
  saveLocalData(records) {
    try {
      localStorage.setItem(this.fallbackStorageKey, JSON.stringify(records));
    } catch (e) {
      console.error("Failed to save to localStorage", e);
    }
  }

  // استماع للتحديثات الحية الفورية
  subscribe(callback) {
    if (this.isInitialized && this.ref) {
      this.ref.on('value', (snapshot) => {
        const data = snapshot.val();
        let records = [];
        if (data) {
          records = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          // ترتيب حسب الأحدث
          records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
        this.saveLocalData(records);
        callback(records, true);
      }, (error) => {
        console.warn("Firebase read error, using local fallback:", error);
        callback(this.getLocalData(), false);
      });
    } else {
      // وضع العمل دون إنترنت
      callback(this.getLocalData(), false);
    }
  }

  // إضافة مسؤول جديد
  async add(representative) {
    const newRecord = {
      ...representative,
      studentsList: representative.studentsList || "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    let recordId = null;

    if (this.isInitialized && this.ref) {
      try {
        const newRef = this.ref.push();
        recordId = newRef.key;
        await newRef.set(newRecord);
      } catch (err) {
        console.warn("Firebase push failed, saving locally:", err);
      }
    }

    if (!recordId) {
      recordId = 'local_' + Date.now();
    }

    // حفظ محلي فوري كنسخة احتياطية دائمة ومباشرة
    const local = this.getLocalData();
    const savedRecord = { id: recordId, ...newRecord };
    if (!local.some((item) => item.id === recordId)) {
      local.unshift(savedRecord);
      this.saveLocalData(local);
    }

    return { success: true, id: recordId, ...newRecord };
  }

  // تحديث بيانات مسؤول (مثلاً تحديث قائمة الطلاب)
  async update(id, updates) {
    const updatedData = {
      ...updates,
      updatedAt: Date.now()
    };

    // تحديث محلي فوري دائماً لضمان سرعة الاستجابة
    const local = this.getLocalData();
    const index = local.findIndex((item) => item.id === id);
    if (index !== -1) {
      local[index] = { ...local[index], ...updatedData };
      this.saveLocalData(local);
    }

    // تحديث سحابي في الوقت الفعلي
    if (this.isInitialized && this.ref && !id.startsWith('local_')) {
      try {
        await this.ref.child(id).update(updatedData);
      } catch (err) {
        console.warn("Firebase update warning:", err);
      }
    }

    return { success: true };
  }

  // حذف مسؤول
  async delete(id) {
    if (this.isInitialized && this.ref && !id.startsWith('local_')) {
      try {
        await this.ref.child(id).remove();
        return { success: true };
      } catch (err) {
        console.error("Firebase remove failed:", err);
      }
    }

    // حذف محلي
    const local = this.getLocalData().filter(item => item.id !== id);
    this.saveLocalData(local);
    return { success: true };
  }
}

window.firebaseService = new FirebaseService();
