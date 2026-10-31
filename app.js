/**
 * منظومة شئون طلاب الجامعات الخاصة والأهلية
 * تطبيق التنسيق الأكاديمي وسحب ملفات الطلاب
 * تصميم وبرمجة: مهندس بولس سمير - مدير شئون الطلاب جامعة اللوتس بالمنيا
 */

// ==========================================
// 1. متغيرات الحالة العامة للتطبيق
// ==========================================
let currentUser = null;
let allRepresentatives = [];
let allRequests = [];
let allNotifications = [];
let allUsers = [];

// حالات العرض والتبويبات
let activeMainView = "dashboard"; // 'auth' | 'dashboard'
let activeDashTab = "incoming";    // 'incoming' | 'new_request' | 'outgoing'
let activeAuthTab = "login";       // 'login' | 'register'

// استعلامات البحث
let currentIncomingSearchQuery = "";
let currentOutgoingSearchQuery = "";

// الكشوف الممتدة في الوارد (تبدأ فارغة لتبدأ متقلصة مع علامة +)
let expandedIncomingRequests = new Set();

// الكشوف الممتدة في الصادرة (نفس نظام التمديد والتقلص الخاص بالواردة)
let expandedOutgoingRequests = new Set();

// مؤقتات الحفظ التلقائي
let noteSaveDebounceTimers = {};

// ==========================================
// 2. التهيئة عند تحميل الصفحة
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  setupUniversityDatalists();
  setupPhoneInputs();

  // فحص المستخدم الحالي المحفوظ بالجلسة
  currentUser = window.firebaseService.getCurrentUser();

  // تحديث واجهة الهيدر بناءً على حالة تسجيل الدخول
  updateHeaderUserInterface();

  // الاشتراك في خدمات Firebase Realtime Database
  initFirebaseSubscriptions();

  // تعيين العرض المبدئي
  if (currentUser) {
    switchMainView("dashboard");
  } else {
    switchMainView("auth");
  }
});

// ملء قوائم الجامعات في الـ Datalist (تدمج القائمة الثابتة + المحفوظة محلياً)
function setupUniversityDatalists() {
  const datalist = document.getElementById("universitiesList");
  if (!datalist) return;

  // القائمة الأساسية: المحكومة من لوحة الإدارة إن وُجدت، وإلا الثابتة الافتراضية
  const baseList = (typeof getActiveUniversities === "function")
    ? getActiveUniversities()
    : (typeof EGYPTIAN_UNIVERSITIES !== "undefined" ? [...EGYPTIAN_UNIVERSITIES] : []);
  const savedExtra = JSON.parse(localStorage.getItem("extraUniversities") || "[]");

  // دمج بدون تكرار
  const merged = [...new Set([...baseList, ...savedExtra])];

  datalist.innerHTML = "";
  merged.forEach((uni) => {
    const opt = document.createElement("option");
    opt.value = uni;
    datalist.appendChild(opt);
  });
}

// إضافة جامعة جديدة للقائمة وحفظها محلياً (تحديث فوري للقوائم المنسدلة فقط)
function addUniversityToDatalist(university) {
  if (!university) return;
  const saved = JSON.parse(localStorage.getItem("extraUniversities") || "[]");
  if (!saved.includes(university)) {
    saved.unshift(university);
    localStorage.setItem("extraUniversities", JSON.stringify(saved));
  }
  if (typeof EGYPTIAN_UNIVERSITIES !== "undefined" && !EGYPTIAN_UNIVERSITIES.includes(university)) {
    EGYPTIAN_UNIVERSITIES.unshift(university);
  }
  setupUniversityDatalists();
}

// تسجيل جامعة جديدة في القائمة المركزية بالسحابة (قائمة الجامعات المحكومة من لوحة الإدارة)
// تُستدعى بعد نجاح تسجيل موظف بجامعة غير موجودة في القائمة، ليتحكم بها الأدمن (تعديل/حذف)
function syncUniversityToCentralList(university) {
  const clean = (university || "").trim();
  if (!clean) return;

  if (window.firebaseService && typeof window.firebaseService.addUniversityIfMissing === "function") {
    window.firebaseService.addUniversityIfMissing(clean)
      .then((added) => {
        if (added) {
          if (typeof showToast === "function") {
            showToast("جامعة جديدة 🏛️", `تمت إضافة جامعة "${clean}" إلى القائمة المركزية ويُمكن للإدارة التحكم فيها`, "success");
          }
          setupUniversityDatalists();
        }
      })
      .catch((err) => console.warn("Failed to sync new university to central list:", err));
  }
}


// تحسين إدخال أرقام الموبايل المصرية (حقل التسجيل فقط - حقل الدخول يقبل اسم جامعة أيضاً)
function setupPhoneInputs() {
  const phoneIds = ["registerPhoneInput"]; // loginPhoneInput مُستثنى لأنه يقبل اسم جامعة
  phoneIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", (e) => {
        let val = convertArabicNumeralsToEnglish(e.target.value);
        val = val.replace(/[^\d+]/g, "");
        e.target.value = val;
      });
    }
  });
}

// تحويل الأرقام العربية/الهندية (٠-٩) إلى أرقام لاتينية (0-9)
function convertArabicNumeralsToEnglish(str) {
  if (!str) return "";
  const arabicNumerals = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.toString().replace(/[٠-٩]/g, (w) => arabicNumerals.indexOf(w));
}

// تنظيف وتوحيد رقم الموبايل المصري
function cleanPhoneNumber(phone) {
  if (!phone) return "";
  let p = convertArabicNumeralsToEnglish(phone).replace(/\D/g, "");
  if (p.startsWith("20") && p.length === 12) {
    p = p.substring(2);
  }
  return p;
}

// تجهيز رقم الموبايل للواتساب الدولي (+2010XXXXXXXX)
function getWhatsAppPhoneNumber(phone) {
  let cleaned = cleanPhoneNumber(phone);
  if (cleaned.startsWith("0")) {
    cleaned = "2" + cleaned;
  } else if (!cleaned.startsWith("20")) {
    cleaned = "20" + cleaned;
  }
  return cleaned;
}

// التحقق من الاسم ثلاثي
function validateFullName(name) {
  const trimmed = (name || "").trim();
  const parts = trimmed.split(/\s+/).filter((part) => part.length > 1);
  return parts.length >= 3;
}

// تطبيع النصوص العربية لتسهيل البحث الذكي الشامل
function normalizeArabic(text) {
  if (!text) return "";
  let str = convertArabicNumeralsToEnglish(text.toString()).toLowerCase();
  return str
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[^\w\s\u0600-\u06FF]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// حماية النصوص من الـ XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// 3. الاشتراكات اللحظية في Firebase
// ==========================================
function initFirebaseSubscriptions() {
  // 1. اشتراك كشوف طلبات سحب الطلاب (Requests)
  window.firebaseService.subscribeRequests((data) => {
    allRequests = data || [];
    if (currentUser) {
      updateDashboardData();
    }
  });

  // 2. اشتراك الإشعارات اللحظية (Notifications)
  window.firebaseService.subscribeNotifications((data) => {
    const prevNotifCount = (allNotifications || []).filter((n) => isNotificationForCurrentUser(n) && !n.isRead).length;
    allNotifications = data || [];
    
    if (currentUser) {
      renderNotifications();
      const newUnreadCount = allNotifications.filter((n) => isNotificationForCurrentUser(n) && !n.isRead).length;
      if (newUnreadCount > prevNotifCount) {
        playNotificationChime();
        const latestNotif = allNotifications.find((n) => isNotificationForCurrentUser(n) && !n.isRead);
        if (latestNotif) {
          showToast("إشعار جديد 🔔", latestNotif.message, "info");
        }
      }
    }
  });

  // 3. اشتراك ممثلي الجامعات وقائمة المستخدمين
  window.firebaseService.subscribeRepresentatives((data) => {
    allRepresentatives = data || [];
  });

  // 4. اشتراك قائمة الجامعات المركزية (ينعكس تعديل الإدارة فوراً على قوائم الاختيار)
  if (typeof window.firebaseService.subscribeUniversities === 'function') {
    window.firebaseService.subscribeUniversities((uniList, hasData) => {
      if (hasData && Array.isArray(uniList)) {
        // إعادة بناء قوائم اختيار الجامعات بعد أي تعديل من لوحة الإدارة
        setupUniversityDatalists();
      }
    });
  }

  window.firebaseService.subscribeUsers((data) => {
    allUsers = data || [];
    // إضافة جامعات المستخدمين المسجّلين للقوائم المحلية فقط
    // (المزامنة مع القائمة المركزية تحدث حصراً عند التسجيل الجديد حتى لا تُلغي حذف الإدارة)
    allUsers.forEach(u => {
      if (u.university) addUniversityToDatalist(u.university);
    });
  });
}

// ==========================================
// 4. التحكم في الشاشات والتنقل الرئيسي
// ==========================================
function switchMainView(view) {
  activeMainView = view;
  const authView = document.getElementById("authView");
  const dashboardView = document.getElementById("employeeDashboardView");

  if (authView) authView.classList.add("hidden");
  if (dashboardView) dashboardView.classList.add("hidden");

  if (view === "auth") {
    if (authView) authView.classList.remove("hidden");
  } else if (view === "dashboard") {
    if (!currentUser) {
      switchMainView("auth");
      return;
    }
    if (dashboardView) dashboardView.classList.remove("hidden");
    updateDashboardData();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// التبديل بين تبويبات لوحة تحكم الموظف (3 تبويبات واضحة فقط)
function switchDashTab(tab) {
  activeDashTab = tab;

  const tabs = [
    { id: "incoming", btn: "tabBtnIncoming", view: "subViewIncoming" },
    { id: "new_request", btn: "tabBtnNewRequest", view: "subViewNewRequest" },
    { id: "outgoing", btn: "tabBtnOutgoing", view: "subViewOutgoing" }
  ];

  tabs.forEach((t) => {
    const btn = document.getElementById(t.btn);
    const view = document.getElementById(t.view);

    if (t.id === tab) {
      if (btn) btn.className = "dash-tab-btn active flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer";
      if (view) view.classList.remove("hidden");
    } else {
      if (btn) btn.className = "dash-tab-btn flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer";
      if (view) view.classList.add("hidden");
    }
  });

  if (tab === "incoming") {
    renderIncomingRequests();
  } else if (tab === "outgoing") {
    renderOutgoingRequests();
  }
}

// التبديل بين تبويبات تسجيل الدخول والتسجيل الجديد
function switchAuthTab(tab) {
  activeAuthTab = tab;
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const tabLoginBtn = document.getElementById("tabLoginBtn");
  const tabRegisterBtn = document.getElementById("tabRegisterBtn");

  if (tab === "login") {
    if (loginForm) loginForm.classList.remove("hidden");
    if (registerForm) registerForm.classList.add("hidden");
    if (tabLoginBtn) tabLoginBtn.className = "py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-amber-500 text-slate-950 cursor-pointer";
    if (tabRegisterBtn) tabRegisterBtn.className = "py-2 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer";
  } else {
    if (loginForm) loginForm.classList.add("hidden");
    if (registerForm) registerForm.classList.remove("hidden");
    if (tabRegisterBtn) tabRegisterBtn.className = "py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-amber-500 text-slate-950 cursor-pointer";
    if (tabLoginBtn) tabLoginBtn.className = "py-2 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer";
  }
}

// تحديث واجهة الهيدر بناءً على حالة تسجيل الدخول
function updateHeaderUserInterface() {
  const headerUser = document.getElementById("headerUserSection");
  const headerGuest = document.getElementById("headerGuestSection");
  const userNameDisplay = document.getElementById("userNameDisplay");
  const userUniversityDisplay = document.getElementById("userUniversityDisplay");
  const userAvatarText = document.getElementById("userAvatarText");

  if (currentUser) {
    if (headerUser) headerUser.classList.remove("hidden");
    if (headerGuest) headerGuest.classList.add("hidden");

    if (userNameDisplay) userNameDisplay.innerText = currentUser.fullName || "مسؤول شئون الطلاب";
    if (userUniversityDisplay) userUniversityDisplay.innerText = currentUser.university || "";
    if (userAvatarText) {
      const firstChar = (currentUser.fullName || "م").trim().charAt(0);
      userAvatarText.innerText = firstChar;
    }
  } else {
    if (headerUser) headerUser.classList.add("hidden");
    if (headerGuest) headerGuest.classList.remove("hidden");
  }
}

// ==========================================
// 5. إدارة الحسابات (دخول، تسجيل، خروج)
// ==========================================

async function handleLoginSubmit(e) {
  e.preventDefault();
  const phoneInput = document.getElementById("loginPhoneInput");
  const passwordInput = document.getElementById("loginPasswordInput");
  const phoneError = document.getElementById("loginPhoneError");
  const submitBtn = document.getElementById("loginSubmitBtn");

  const rawInput = phoneInput.value.trim();
  const password = passwordInput.value;

  // تحديد نوع الإدخال: رقم موبايل أم اسم جامعة
  const digitsOnly = rawInput.replace(/\D/g, "");
  const isPhone = digitsOnly.length > 0 && /^\d+$/.test(rawInput.replace(/[\s\-\+]/g, ""));
  const identifier = isPhone ? cleanPhoneNumber(rawInput) : rawInput;

  if (isPhone) {
    if (!/^01[0125][0-9]{8}$/.test(identifier)) {
      if (phoneError) phoneError.classList.remove("hidden");
      phoneInput.focus();
      return;
    }
    if (phoneError) phoneError.classList.add("hidden");
  } else {
    // اسم جامعة — لا يحتاج تحقق من صيغة رقم
    if (phoneError) phoneError.classList.add("hidden");
  }


  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-sm"></i> <span>جاري التحقق...</span>`;

  try {
    const res = await window.firebaseService.loginUser(identifier, password);
    if (res.success) {
      currentUser = res.user;
      updateHeaderUserInterface();
      showToast("مرحباً بك 👋", `تم تسجيل الدخول كمسؤول شئون طلاب ${currentUser.university}`, "success");
      switchMainView("dashboard");
    } else {
      showToast("تعذر تسجيل الدخول", res.error || "تأكد من اسم الجامعة أو رقم الموبايل أو كلمة المرور", "error");
    }
  } catch (err) {
    console.error("Login error:", err);
    showToast("خطأ", "حدث خطأ أثناء الدخول", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}


async function handleRegisterSubmit(e) {
  e.preventDefault();
  const phoneInput    = document.getElementById("registerPhoneInput");
  const uniInput      = document.getElementById("registerUniversityInput");
  const contactInput  = document.getElementById("registerContactPersonInput");
  const passwordInput = document.getElementById("registerPasswordInput");
  const phoneError    = document.getElementById("registerPhoneError");
  const submitBtn     = document.getElementById("registerSubmitBtn");

  const rawPhone    = phoneInput ? phoneInput.value.trim() : "";
  const university  = uniInput  ? uniInput.value.trim()   : "";
  const contactPerson = contactInput ? contactInput.value.trim() : "";
  const password    = passwordInput ? passwordInput.value : "";

  // التحقق من اسم الجامعة
  if (!university) {
    showToast("تنبيه", "يرجى تحديد أو كتابة اسم الجامعة", "error");
    if (uniInput) uniInput.focus();
    return;
  }

  // التحقق من رقم الموبايل
  const cleanedPhone = cleanPhoneNumber(rawPhone);
  if (!/^01[0125][0-9]{8}$/.test(cleanedPhone)) {
    if (phoneError) phoneError.classList.remove("hidden");
    if (phoneInput) phoneInput.focus();
    return;
  }
  if (phoneError) phoneError.classList.add("hidden");

  // التحقق من كلمة المرور
  if (!password || password.length < 4) {
    showToast("تنبيه", "يرجى إدخال كلمة مرور (4 أحرف على الأقل)", "error");
    if (passwordInput) passwordInput.focus();
    return;
  }

  // إضافة الجامعة للقائمة المنسدلة تلقائياً
  addUniversityToDatalist(university);

  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-sm"></i> <span>جاري إنشاء الحساب...</span>`;

  try {
    const userData = {
      fullName: university,
      phone: cleanedPhone,
      university,
      contactPerson,
      jobTitle: "مسؤول شئون الطلاب",
      password
    };

    const res = await window.firebaseService.registerUser(userData);
    if (res.success) {
      currentUser = res.user;
      window.firebaseService.setCurrentUser(currentUser);
      updateHeaderUserInterface();
      // تسجيل الجامعة في القائمة المركزية بالسحابة إذا كانت جديدة
      // كي تظهر فعلياً بشاشة الإدارة ويبقى الإدمن متحكماً فيها (تعديل/حذف)
      syncUniversityToCentralList(university);
      showToast("أهلاً بك 🎉", `تم إنشاء حساب جامعة ${university} بنجاح`, "success");
      switchMainView("dashboard");
    } else {
      showToast("خطأ", res.error || "تعذر إنشاء الحساب", "error");
    }
  } catch (err) {
    console.error("Register error:", err);
    showToast("خطأ", "حدث خطأ أثناء حفظ الحساب، تحقق من الاتصال", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}


function handleUserLogout() {
  if (confirm("هل تريد تسجيل الخروج من حسابك؟")) {
    window.firebaseService.clearCurrentUser();
    currentUser = null;
    updateHeaderUserInterface();
    switchMainView("auth");
    showToast("تم تسجيل الخروج", "تمت العودة لبوابة تسجيل الدخول", "info");
  }
}

// ==========================================
// 6. لوحة تحكم الموظف الشخصية (Dashboard)
// ==========================================

function updateDashboardData() {
  if (!currentUser) return;

  const welcomeName = document.getElementById("dashWelcomeName");
  const welcomeUni = document.getElementById("dashWelcomeUni");
  const welcomeJob = document.getElementById("dashWelcomeJob");

  if (welcomeName) welcomeName.innerText = currentUser.fullName || "";
  if (welcomeUni) welcomeUni.innerText = currentUser.university || "";
  if (welcomeJob) welcomeJob.innerText = currentUser.jobTitle || "مسؤول شئون الطلاب";

  const userUniNorm = normalizeArabic(currentUser.university || "");
  const incomingReqs = allRequests.filter((r) => {
    return normalizeArabic(r.targetUniversity || "") === userUniNorm;
  });

  const userPhoneClean = cleanPhoneNumber(currentUser.phone);
  const outgoingReqs = allRequests.filter((r) => {
    return r.senderId === currentUser.id || cleanPhoneNumber(r.senderPhone) === userPhoneClean;
  });

  let totalIncomingStudents = 0;
  let completedStudentsCount = 0;

  incomingReqs.forEach((req) => {
    if (req.students && Array.isArray(req.students)) {
      totalIncomingStudents += req.students.length;
      completedStudentsCount += req.students.filter((s) => s.isCompleted).length;
    }
  });

  const completionPercent = totalIncomingStudents > 0 
    ? Math.round((completedStudentsCount / totalIncomingStudents) * 100) 
    : 0;

  const statIncReq = document.getElementById("statIncomingRequests");
  const statIncStud = document.getElementById("statIncomingStudents");
  const statCompPercent = document.getElementById("statCompletedPercent");
  const statOutReq = document.getElementById("statOutgoingRequests");

  const incomingBadgeCounter = document.getElementById("incomingBadgeCounter");
  const outgoingBadgeCounter = document.getElementById("outgoingBadgeCounter");

  if (statIncReq) statIncReq.innerText = incomingReqs.length;
  if (statIncStud) statIncStud.innerText = totalIncomingStudents;
  if (statCompPercent) statCompPercent.innerText = `${completionPercent}% تم سحبهم (${completedStudentsCount}/${totalIncomingStudents})`;
  if (statOutReq) statOutReq.innerText = outgoingReqs.length;

  if (incomingBadgeCounter) incomingBadgeCounter.innerText = incomingReqs.length;
  if (outgoingBadgeCounter) outgoingBadgeCounter.innerText = outgoingReqs.length;

  if (activeDashTab === "incoming") {
    renderIncomingRequests();
  } else if (activeDashTab === "outgoing") {
    renderOutgoingRequests();
  }
}

// ==========================================
// 7. الكشوف الواردة لجامعتي (متقلصة مع علامة + وإمكانية الحذف)
// ==========================================

function toggleIncomingRequestExpand(requestId, event) {
  if (event) event.stopPropagation();
  const bodyEl = document.getElementById(`request-body-${requestId}`);
  const iconEl = document.getElementById(`expand-icon-${requestId}`);
  const labelEl = document.getElementById(`expand-label-${requestId}`);
  
  if (expandedIncomingRequests.has(requestId)) {
    expandedIncomingRequests.delete(requestId);
    if (bodyEl) bodyEl.classList.add("hidden");
    if (iconEl) iconEl.className = "fa-solid fa-plus";
    if (labelEl) labelEl.innerText = "انقر للتمديد وعرض أسماء الطلاب 🔽";
  } else {
    expandedIncomingRequests.add(requestId);
    if (bodyEl) bodyEl.classList.remove("hidden");
    if (iconEl) iconEl.className = "fa-solid fa-minus";
    if (labelEl) labelEl.innerText = "انقر لطي الكشف 🔼";
  }
}

function expandAllIncomingRequests() {
  const userUniNorm = normalizeArabic(currentUser ? currentUser.university || "" : "");
  allRequests
    .filter((r) => normalizeArabic(r.targetUniversity || "") === userUniNorm)
    .forEach((r) => expandedIncomingRequests.add(r.id));
  renderIncomingRequests();
}

function collapseAllIncomingRequests() {
  expandedIncomingRequests.clear();
  renderIncomingRequests();
}

function handleIncomingSearch(val) {
  currentIncomingSearchQuery = val || "";
  renderIncomingRequests();
}

function renderIncomingRequests() {
  const container = document.getElementById("incomingRequestsContainer");
  const emptyState = document.getElementById("incomingEmptyState");
  const countDisplay = document.getElementById("incomingCountDisplay");
  if (!container || !currentUser) return;

  const userUniNorm = normalizeArabic(currentUser.university || "");
  let requests = allRequests.filter((r) => {
    return normalizeArabic(r.targetUniversity || "") === userUniNorm;
  });

  if (currentIncomingSearchQuery && currentIncomingSearchQuery.trim() !== "") {
    const qTerms = normalizeArabic(currentIncomingSearchQuery).split(/\s+/).filter(Boolean);
    requests = requests.filter((req) => {
      const fullText = normalizeArabic(
        `${req.senderUniversity || ""} ${req.senderName || ""} ${(req.students || []).map((s) => `${s.name} ${s.nationalId || ""}`).join(" ")}`
      );
      return qTerms.every((term) => fullText.includes(term));
    });
  }

  if (countDisplay) countDisplay.innerText = requests.length;

  if (requests.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  container.innerHTML = requests.map((req) => {
    const students = req.students || [];
    const totalCount = students.length;
    const completedCount = students.filter((s) => s.isCompleted).length;
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const formattedDate = new Date(req.createdAt || Date.now()).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    const isExpanded = expandedIncomingRequests.has(req.id);

    return `
      <div class="glass-card p-4 sm:p-5 border border-white/10 shadow transition-all" id="request-card-${req.id}">
        
        <!-- رأس الكشف المتقلص -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${isExpanded ? 'border-b border-white/10 pb-3.5' : ''}">
          
          <div class="flex items-start gap-3 flex-1 cursor-pointer select-none" onclick="toggleIncomingRequestExpand('${req.id}', event)">
            <!-- زر + أو - للتمديد والطي -->
            <button 
              type="button"
              onclick="toggleIncomingRequestExpand('${req.id}', event)"
              class="w-9 h-9 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center justify-center text-sm font-bold transition-all cursor-pointer shadow flex-shrink-0 mt-0.5"
              title="${isExpanded ? 'طي الكشف' : 'تمديد وعرض أسماء الطلاب'}"
            >
              <i id="expand-icon-${req.id}" class="fa-solid ${isExpanded ? 'fa-minus' : 'fa-plus'}"></i>
            </button>

            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="text-sm sm:text-base font-bold text-white leading-tight">
                  كشف وارد من: <span class="text-amber-300 font-extrabold">${escapeHtml(req.senderUniversity)}</span>
                </h4>
                <span class="px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                  completedCount === totalCount && totalCount > 0
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                }">
                  ${completedCount} / ${totalCount} تم سحبهم (${progressPercent}%)
                </span>
              </div>
              <div class="flex items-center gap-3 text-xs text-slate-300 mt-1 flex-wrap">
                <span>المرسل: <strong>${escapeHtml(req.senderName)}</strong></span>
                <span class="text-slate-500">•</span>
                <span class="font-mono text-slate-400">${formattedDate}</span>
                <span class="text-slate-500">•</span>
                <a href="tel:${req.senderPhone}" onclick="event.stopPropagation()" class="text-emerald-400 font-mono font-bold hover:underline" dir="ltr">
                  ${escapeHtml(req.senderPhone)}
                </a>
              </div>
              <p id="expand-label-${req.id}" class="text-[11px] text-amber-300/80 font-medium mt-1">
                ${isExpanded ? 'انقر لطي الكشف 🔼' : `انقر للتمديد وعرض أسماء الطلاب (${totalCount} طالب) 🔽`}
              </p>
            </div>
          </div>

          <!-- أزرار الإجراءات للكشف: تقرير واتساب + طباعة + حذف الكشف -->
          <div class="flex items-center gap-2 w-full sm:w-auto justify-end pt-1 sm:pt-0" onclick="event.stopPropagation()">
            <button 
              onclick="sendIncomingStatusReportToWhatsApp('${req.id}')"
              class="btn-whatsapp px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow"
              title="إرسال تقرير حالة للواتساب للمسؤول المرسل"
            >
              <i class="fa-brands fa-whatsapp"></i>
              <span>واتساب</span>
            </button>

            <button 
              onclick="openPrintReportModal('${req.id}')"
              class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="معاينة وطباعة الكشف الرسمي"
            >
              <i class="fa-solid fa-print"></i>
              <span>طباعة</span>
            </button>

            <!-- زر حذف الكشف الوارد -->
            <button 
              onclick="handleDeleteIncomingRequest('${req.id}', event)"
              class="btn-danger px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="حذف هذا الكشف الوارد نهائياً"
            >
              <i class="fa-regular fa-trash-can"></i>
              <span>حذف</span>
            </button>
          </div>
        </div>

        <!-- جسم الكشف القابل للتمديد والطي (افتراضياً متقلص) -->
        <div id="request-body-${req.id}" class="${isExpanded ? '' : 'hidden'} space-y-3.5 pt-3.5 transition-all">
          
          <!-- شريط التقدم -->
          <div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 progress-fill rounded-full" style="width: ${progressPercent}%"></div>
          </div>

          <!-- جدول أسماء الطلاب والتحكم (Check + Notes) -->
          <div class="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/60">
            <table class="w-full text-right border-collapse text-xs sm:text-sm">
              <thead>
                <tr class="bg-slate-800/80 text-amber-300 border-b border-white/10 text-xs font-bold">
                  <th class="py-2.5 px-3 w-10 text-center">#</th>
                  <th class="py-2.5 px-3 min-w-[190px]">اسم الطالب</th>
                  <th class="py-2.5 px-3 min-w-[150px] text-center">الرقم القومي</th>
                  <th class="py-2.5 px-3 min-w-[140px] text-center">حالة السحب</th>
                  <th class="py-2.5 px-3 min-w-[240px]">خانة الملاحظات</th>
                  <th class="py-2.5 px-3 min-w-[110px] text-center">التاريخ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${students.map((st, idx) => {
                  const isDone = !!st.isCompleted;
                  const formattedTime = st.completedAt 
                    ? new Date(st.completedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
                    : "";

                  return `
                    <tr class="hover:bg-slate-800/30 transition-colors ${isDone ? 'bg-emerald-500/5' : ''}">
                      <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-400">${idx + 1}</td>

                      <td class="py-2.5 px-3 font-bold text-white">
                        <span class="${isDone ? 'text-emerald-300' : 'text-slate-100'}">${escapeHtml(st.name)}</span>
                      </td>

                      <!-- الرقم القومي -->
                      <td class="py-2.5 px-3 text-center">
                        ${
                          st.nationalId && String(st.nationalId).trim()
                            ? `<span class="font-mono text-slate-200 font-bold text-xs" dir="ltr">${escapeHtml(st.nationalId)}</span>`
                            : `<span class="text-slate-500 text-xs italic">غير مسجل</span>`
                        }
                      </td>

                      <!-- زر الاتشيك -->
                      <td class="py-2.5 px-3 text-center">
                        <button 
                          type="button"
                          onclick="handleToggleStudentStatus('${req.id}', '${st.id}', ${!isDone})"
                          class="withdrawal-check-btn px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer border flex items-center justify-center gap-1.5 mx-auto ${
                            isDone 
                              ? 'checked bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                              : 'bg-slate-800 text-slate-300 border-white/10 hover:border-amber-400'
                          }"
                        >
                          <i class="fa-solid ${isDone ? 'fa-circle-check text-emerald-400' : 'fa-circle text-slate-500'}"></i>
                          <span>${isDone ? 'تم السحب ✅' : 'وضع علامة تم السحب'}</span>
                        </button>
                      </td>

                      <!-- خانة الملاحظات -->
                      <td class="py-2.5 px-3">
                        <input 
                          type="text" 
                          id="note-input-${st.id}"
                          value="${escapeHtml(st.notes || '')}"
                          oninput="handleStudentNoteInputChanged('${req.id}', '${st.id}', this.value)"
                          onblur="handleStudentNoteBlur('${req.id}', '${st.id}', this.value)"
                          placeholder="اكتب ملاحظة (مثل: تم تسليم الملف لولي الأمر)..." 
                          class="student-note-input w-full px-2.5 py-1.5 rounded-lg text-xs text-white placeholder-slate-500"
                        >
                      </td>

                      <td class="py-2.5 px-3 text-center text-xs">
                        ${isDone ? `<span class="text-emerald-400 font-mono font-bold">${formattedTime}</span>` : `<span class="text-slate-500">-</span>`}
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    `;
  }).join("");
}

// حذف كشف وارد
async function handleDeleteIncomingRequest(requestId, event) {
  if (event) event.stopPropagation();
  if (confirm("هل أنت متأكد من رغبتك في حذف هذا الكشف الوارد نهائياً؟")) {
    await window.firebaseService.deleteWithdrawalRequest(requestId);
    showToast("تم الحذف 🗑️", "تم حذف الكشف الوارد بنجاح", "info");
    updateDashboardData();
  }
}

// تبديل حالة الطالب
async function handleToggleStudentStatus(requestId, studentId, newCompletedState) {
  if (!currentUser) return;

  try {
    const res = await window.firebaseService.updateStudentInRequest(
      requestId,
      studentId,
      { isCompleted: newCompletedState },
      currentUser
    );

    if (res.success) {
      showToast("تحديث الحالة", newCompletedState ? `تم تأكيد سحب ملف: "${res.student.name}" ✅` : `تم إلغاء تأكيد السحب`, newCompletedState ? "success" : "info");
      updateDashboardData();
    }
  } catch (err) {
    showToast("خطأ", "تعذر تحديث حالة الطالب", "error");
  }
}

// حفظ ملاحظات الطالب
function handleStudentNoteInputChanged(requestId, studentId, noteVal) {
  if (noteSaveDebounceTimers[studentId]) {
    clearTimeout(noteSaveDebounceTimers[studentId]);
  }
  noteSaveDebounceTimers[studentId] = setTimeout(async () => {
    await saveStudentNoteFinal(requestId, studentId, noteVal);
  }, 700);
}

function handleStudentNoteBlur(requestId, studentId, noteVal) {
  if (noteSaveDebounceTimers[studentId]) {
    clearTimeout(noteSaveDebounceTimers[studentId]);
  }
  saveStudentNoteFinal(requestId, studentId, noteVal);
}

async function saveStudentNoteFinal(requestId, studentId, noteVal) {
  if (!currentUser) return;
  try {
    await window.firebaseService.updateStudentInRequest(
      requestId,
      studentId,
      { notes: noteVal.trim() },
      currentUser
    );
  } catch (err) {
    console.warn("Save note error:", err);
  }
}

// إرسال تقرير حالة الكشف للواتساب للمسؤول المرسل
function sendIncomingStatusReportToWhatsApp(requestId) {
  const req = allRequests.find((r) => r.id === requestId);
  if (!req) return;

  const students = req.students || [];
  const lines = students.map((st, idx) => {
    const statusText = st.isCompleted ? "✅ تم السحب" : "⏳ قيد السحب";
    const noteText = st.notes ? ` (ملاحظات: ${st.notes})` : "";
    return `${idx + 1}. ${st.name} : ${statusText}${noteText}`;
  });

  const waPhone = getWhatsAppPhoneNumber(req.senderPhone);
  const message = `الساده مسئول شئون طلاب جامعة ${req.senderUniversity}
تحية طيبة وبعد،

إفادة بشأن كشف سحب الطلاب الموجه لجامعة ${req.targetUniversity}:
${lines.join("\n")}

شاكرين لسيادتكم وافر التعاون والتقدير.
${currentUser ? currentUser.fullName : 'مسؤول شئون الطلاب'}
${currentUser ? currentUser.university : ''}`;

  const url = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
  showToast("تم فتح الواتساب 📲", "تم تجهيز تقرير حالة الطلاب وإرساله للمسؤول", "success");
}

// ==========================================
// 8. إرسال كشف سحب جديد (مبسط ومباشر مع إظهار بيانات مسؤول الجامعة)
// ==========================================

function handleTargetUniversityChanged(uniName) {
  const infoBox = document.getElementById("targetRepInfoBox");
  const notFoundBox = document.getElementById("targetRepNotFoundBox");
  const repName = document.getElementById("targetRepName");
  const repPhone = document.getElementById("targetRepPhone");
  const callLink = document.getElementById("targetRepCallLink");
  const waLink = document.getElementById("targetRepWaLink");

  if (!infoBox) return;

  const cleanUni = normalizeArabic(uniName || "");
  if (!cleanUni) {
    infoBox.classList.add("hidden");
    if (notFoundBox) notFoundBox.classList.add("hidden");
    return;
  }

  // البحث في ممثلي الجامعات وقائمة المستخدمين المسجلين
  let found = allRepresentatives.find((r) => normalizeArabic(r.university || "") === cleanUni);
  if (!found) {
    found = allUsers.find((u) => normalizeArabic(u.university || "") === cleanUni);
  }

  if (found) {
    infoBox.classList.remove("hidden");
    if (notFoundBox) notFoundBox.classList.add("hidden");
    if (repName) repName.innerText = found.fullName || "مسؤول شئون الطلاب";
    if (repPhone) repPhone.innerText = found.phone || "";
    if (callLink) callLink.href = `tel:${found.phone}`;
    if (waLink) {
      waLink.href = `https://api.whatsapp.com/send?phone=${getWhatsAppPhoneNumber(found.phone)}`;
    }
  } else {
    infoBox.classList.add("hidden");
    if (notFoundBox) notFoundBox.classList.remove("hidden");
  }
}

function onRequestStudentsInputChanged(text) {
  const countBadge = document.getElementById("requestStudentsCountBadge");
  const count = countStudentsInText(text);
  if (countBadge) {
    countBadge.innerText = `${count} ${count === 1 ? 'طالب' : 'طلاب'}`;
  }
  renderRequestStudentsPreview(text);
}

// ==========================================
// معاينة حية تلقائية: بمجرد اللصق يفهم النظام وجود
// الرقم القومي ويضعه في عمود مستقل قبل الإرسال
// ==========================================

function renderRequestStudentsPreview(rawText) {
  const preview = document.getElementById("requestStudentsPreview");
  if (!preview) return;

  const entries = extractStudentsDetailed(rawText || "");
  const nidCount = entries.filter((e) => e.nationalId).length;

  if (entries.length === 0) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }

  preview.classList.remove("hidden");

  const rows = entries.map((e, i) => `
    <tr class="border-b border-white/5 last:border-0">
      <td class="py-1.5 px-2.5 text-center font-mono text-slate-500">${i + 1}</td>
      <td class="py-1.5 px-2.5 font-bold text-slate-100">${escapeHtml(e.name || "—")}</td>
      <td class="py-1.5 px-2.5 text-center">
        ${
          e.nationalId
            ? `<span class="font-mono text-emerald-300 font-bold text-xs whitespace-nowrap" dir="ltr">${escapeHtml(e.nationalId)} <i class="fa-solid fa-circle-check text-[10px] text-emerald-400"></i></span>`
            : `<span class="text-slate-600 text-xs italic">—</span>`
        }
      </td>
    </tr>
  `).join("");

  preview.innerHTML = `
    <div class="flex items-center justify-between mb-2 flex-wrap gap-1.5">
      <span class="text-[11px] font-bold text-blue-300 flex items-center gap-1.5">
        <i class="fa-solid fa-wand-magic-sparkles"></i> فهم تلقائي: الأرقام القومية انتقلت لعمودها
      </span>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${nidCount > 0 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-slate-800 text-slate-500 border border-white/10'}">
        ${nidCount > 0 ? `تم التعرف على ${nidCount} رقم قومي تلقائياً ✔` : 'لم يتم التعرف على أرقام قومية بعد'}
      </span>
    </div>
    <div class="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/60">
      <table class="w-full text-right text-xs">
        <thead>
          <tr class="bg-slate-800/80 text-slate-400 text-[10px] font-bold">
            <th class="py-1.5 px-2.5 w-8 text-center">م</th>
            <th class="py-1.5 px-2.5">اسم الطالب</th>
            <th class="py-1.5 px-2.5 w-36 text-center">الرقم القومي (تلقائي)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function clearNewRequestStudents() {
  const textarea = document.getElementById("requestStudentsTextarea");
  if (!textarea) return;
  textarea.value = "";
  onRequestStudentsInputChanged("");
}

async function handleCreateRequestSubmit(e) {
  e.preventDefault();
  if (!currentUser) {
    showToast("تنبيه", "يرجى تسجيل الدخول أولاً", "error");
    return;
  }

  const uniInput = document.getElementById("targetUniversityInput");
  const textarea = document.getElementById("requestStudentsTextarea");
  const submitBtn = document.getElementById("submitRequestBtn");

  const targetUni = uniInput.value.trim();
  const rawStudents = textarea.value.trim();

  if (!targetUni) {
    showToast("تنبيه", "يرجى تحديد الجامعة المستهدفة", "error");
    uniInput.focus();
    return;
  }

  if (!rawStudents) {
    showToast("تنبيه", "يرجى إدخال أسماء الطلاب المراد سحبهم", "error");
    textarea.focus();
    return;
  }

  const studentEntries = extractStudentsDetailed(rawStudents);
  if (studentEntries.length === 0) {
    showToast("تنبيه", "لم يتم العثور على أي أسماء طلاب صالحة", "error");
    return;
  }
  const studentsWithNationalId = studentEntries.filter((s) => s.nationalId).length;

  let rep = allRepresentatives.find((r) => normalizeArabic(r.university || "") === normalizeArabic(targetUni));
  if (!rep) {
    rep = allUsers.find((u) => normalizeArabic(u.university || "") === normalizeArabic(targetUni));
  }

  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>جاري الإرسال...</span>`;

  try {
    const requestData = {
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      senderUniversity: currentUser.university,
      senderPhone: currentUser.phone,
      senderWhatsApp: getWhatsAppPhoneNumber(currentUser.phone),
      targetUniversity: targetUni,
      targetRepresentativeName: rep ? rep.fullName : "",
      targetRepresentativePhone: rep ? rep.phone : "",
      title: `كشف سحب طلاب لجامعة ${targetUni}`,
      notes: "",
      studentsList: studentEntries
    };

    const res = await window.firebaseService.createWithdrawalRequest(requestData);

    if (res.success) {
      showToast(
        "تم إرسال الكشف بنجاح 🚀",
        `تم إرسال كشف يضم ${studentEntries.length} طلاب لجامعة ${targetUni}` +
        (studentsWithNationalId > 0 ? ` (مسجل الأرقام القومية: ${studentsWithNationalId})` : ""),
        "success"
      );
      e.target.reset();
      onRequestStudentsInputChanged("");
      const infoBox = document.getElementById("targetRepInfoBox");
      if (infoBox) infoBox.classList.add("hidden");
      setTimeout(() => switchDashTab("outgoing"), 400);
    }
  } catch (err) {
    console.error("Create request error:", err);
    showToast("خطأ", "حدث خطأ أثناء إرسال الكشف", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

function sendNewRequestViaWhatsApp() {
  const uniInput = document.getElementById("targetUniversityInput");
  const textarea = document.getElementById("requestStudentsTextarea");

  const targetUni = uniInput.value.trim();
  const rawStudents = textarea.value.trim();

  if (!targetUni) {
    showToast("تنبيه", "يرجى تحديد اسم الجامعة المستهدفة أولاً", "error");
    uniInput.focus();
    return;
  }

  if (!rawStudents) {
    showToast("تنبيه", "يرجى كتابة أسماء الطلاب أولاً", "error");
    textarea.focus();
    return;
  }

  let rep = allRepresentatives.find((r) => normalizeArabic(r.university || "") === normalizeArabic(targetUni));
  if (!rep) {
    rep = allUsers.find((u) => normalizeArabic(u.university || "") === normalizeArabic(targetUni));
  }
  const phone = rep ? rep.phone : "";

  const numberedStudents = formatStudentsToNumberedPoints(rawStudents);
  const message = generateWhatsAppMessageText(targetUni, numberedStudents);

  const waPhone = phone ? getWhatsAppPhoneNumber(phone) : "";
  const waUrl = waPhone 
    ? `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  window.open(waUrl, "_blank");
  showToast("تم فتح محادثة الواتساب 📲", "تم تجهيز الرسالة بالصيغة الرسمية المعتمدة", "success");
}

// ==========================================
// 9. متابعة كشوفاتي الصادرة (مع إمكانية الحذف)
// ==========================================

function handleOutgoingSearch(val) {
  currentOutgoingSearchQuery = val || "";
  renderOutgoingRequests();
}

// تمديد وطي الكشوف الصادرة — نفس نظام الكشوف الواردة تماماً
function toggleOutgoingRequestExpand(requestId, event) {
  if (event) event.stopPropagation();
  const bodyEl = document.getElementById(`outgoing-body-${requestId}`);
  const iconEl = document.getElementById(`outgoing-expand-icon-${requestId}`);
  const labelEl = document.getElementById(`outgoing-expand-label-${requestId}`);

  if (expandedOutgoingRequests.has(requestId)) {
    expandedOutgoingRequests.delete(requestId);
    if (bodyEl) bodyEl.classList.add("hidden");
    if (iconEl) iconEl.className = "fa-solid fa-plus";
    if (labelEl) labelEl.innerText = "انقر للتمديد وعرض أسماء الطلاب 🔽";
  } else {
    expandedOutgoingRequests.add(requestId);
    if (bodyEl) bodyEl.classList.remove("hidden");
    if (iconEl) iconEl.className = "fa-solid fa-minus";
    if (labelEl) labelEl.innerText = "انقر لطي الكشف 🔼";
  }
}

function expandAllOutgoingRequests() {
  const userPhoneClean = cleanPhoneNumber(currentUser ? currentUser.phone || "" : "");
  allRequests
    .filter((r) => r.senderId === (currentUser ? currentUser.id : "") || cleanPhoneNumber(r.senderPhone || "") === userPhoneClean)
    .forEach((r) => expandedOutgoingRequests.add(r.id));
  renderOutgoingRequests();
}

function collapseAllOutgoingRequests() {
  expandedOutgoingRequests.clear();
  renderOutgoingRequests();
}

function renderOutgoingRequests() {
  const container = document.getElementById("outgoingRequestsContainer");
  const emptyState = document.getElementById("outgoingEmptyState");
  const countDisplay = document.getElementById("outgoingCountDisplay");
  if (!container || !currentUser) return;

  const userPhoneClean = cleanPhoneNumber(currentUser.phone);
  let requests = allRequests.filter((r) => {
    return r.senderId === currentUser.id || cleanPhoneNumber(r.senderPhone) === userPhoneClean;
  });

  if (currentOutgoingSearchQuery && currentOutgoingSearchQuery.trim() !== "") {
    const qTerms = normalizeArabic(currentOutgoingSearchQuery).split(/\s+/).filter(Boolean);
    requests = requests.filter((req) => {
      const fullText = normalizeArabic(
        `${req.targetUniversity || ""} ${(req.students || []).map((s) => `${s.name} ${s.nationalId || ""}`).join(" ")}`
      );
      return qTerms.every((term) => fullText.includes(term));
    });
  }

  if (countDisplay) countDisplay.innerText = requests.length;

  if (requests.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  container.innerHTML = requests.map((req) => {
    const students = req.students || [];
    const totalCount = students.length;
    const completedCount = students.filter((s) => s.isCompleted).length;
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const formattedDate = new Date(req.createdAt || Date.now()).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    const isExpanded = expandedOutgoingRequests.has(req.id);

    return `
      <div class="glass-card p-4 sm:p-5 border border-white/10 shadow transition-all" id="outgoing-card-${req.id}">

        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${isExpanded ? 'border-b border-white/10 pb-3.5' : ''}">

          <div class="flex items-start gap-3 flex-1 cursor-pointer select-none" onclick="toggleOutgoingRequestExpand('${req.id}', event)">
            <!-- زر + أو - للتمديد والطي (مثل الكشوف الواردة) -->
            <button
              type="button"
              onclick="toggleOutgoingRequestExpand('${req.id}', event)"
              class="w-9 h-9 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 flex items-center justify-center text-sm font-bold transition-all cursor-pointer shadow flex-shrink-0 mt-0.5"
              title="${isExpanded ? 'طي الكشف' : 'تمديد وعرض أسماء الطلاب'}"
            >
              <i id="outgoing-expand-icon-${req.id}" class="fa-solid ${isExpanded ? 'fa-minus' : 'fa-plus'}"></i>
            </button>

            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="text-sm sm:text-base font-bold text-white leading-tight">
                  كشف مرسل إلى: <span class="text-amber-300 font-extrabold">${escapeHtml(req.targetUniversity)}</span>
                </h4>
                <span class="px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                  completedCount === totalCount && totalCount > 0
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                    : 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
                }">
                  ${completedCount} / ${totalCount} تم سحبهم (${progressPercent}%)
                </span>
              </div>
              <div class="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                <span>تاريخ الإرسال: ${formattedDate}</span>
                ${req.targetRepresentativeName ? `<span>• مسؤول الجامعة: ${escapeHtml(req.targetRepresentativeName)}</span>` : ''}
              </div>
              <p id="outgoing-expand-label-${req.id}" class="text-[11px] text-blue-300/80 font-medium mt-1">
                ${isExpanded ? 'انقر لطي الكشف 🔼' : `انقر للتمديد وعرض أسماء الطلاب (${totalCount} طالب) 🔽`}
              </p>
            </div>
          </div>

          <!-- أزرار الإجراءات للكشف الصادر: مراسلة واتساب + حذف الكشف -->
          <div class="flex items-center gap-2 w-full sm:w-auto justify-end pt-1 sm:pt-0" onclick="event.stopPropagation()">
            ${
              req.targetRepresentativePhone
                ? `<a 
                    href="https://api.whatsapp.com/send?phone=${getWhatsAppPhoneNumber(req.targetRepresentativePhone)}" 
                    target="_blank" 
                    class="btn-whatsapp px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow"
                    title="مراسلة مسؤول الجامعة على الواتساب"
                  >
                    <i class="fa-brands fa-whatsapp"></i>
                    <span>مراسلة المسؤول</span>
                  </a>`
                : ''
            }
            
            <!-- زر حذف الكشف الصادر -->
            <button 
              onclick="handleDeleteOutgoingRequest('${req.id}', event)"
              class="btn-danger px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="حذف هذا الكشف الصادر نهائياً"
            >
              <i class="fa-regular fa-trash-can"></i>
              <span>حذف</span>
            </button>
          </div>
        </div>

        <!-- جسم الكشف الصادر القابل للتمديد والطي (افتراضياً متقلص زي الواردة) -->
        <div id="outgoing-body-${req.id}" class="${isExpanded ? '' : 'hidden'} space-y-3.5 pt-3.5">

          <div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-blue-500 to-emerald-400 progress-fill rounded-full" style="width: ${progressPercent}%"></div>
          </div>

          <!-- جدول متابعة الطلاب والملاحظات المكتوبة من الطرف الآخر -->
        <div class="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/60">
          <table class="w-full text-right border-collapse text-xs sm:text-sm">
            <thead>
              <tr class="bg-slate-800/80 text-amber-300 border-b border-white/10 text-xs font-bold">
                <th class="py-2.5 px-3 w-10 text-center">#</th>
                <th class="py-2.5 px-3 min-w-[190px]">اسم الطالب</th>
                <th class="py-2.5 px-3 min-w-[150px] text-center">الرقم القومي</th>
                <th class="py-2.5 px-3 min-w-[140px] text-center">حالة السحب</th>
                <th class="py-2.5 px-3 min-w-[240px]">ملاحظات مسؤولي جامعة (${escapeHtml(req.targetUniversity)})</th>
                <th class="py-2.5 px-3 min-w-[110px] text-center">الوقت</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              ${students.map((st, idx) => {
                const isDone = !!st.isCompleted;
                const formattedTime = st.completedAt 
                  ? new Date(st.completedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
                  : "";

                return `
                  <tr class="hover:bg-slate-800/30 transition-colors ${isDone ? 'bg-emerald-500/5' : ''}">
                    <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-400">${idx + 1}</td>
                    <td class="py-2.5 px-3 font-bold text-white">
                      <span class="${isDone ? 'text-emerald-300' : 'text-slate-100'}">${escapeHtml(st.name)}</span>
                    </td>
                    <!-- الرقم القومي -->
                    <td class="py-2.5 px-3 text-center">
                      ${
                        st.nationalId && String(st.nationalId).trim()
                          ? `<span class="font-mono text-slate-200 font-bold text-xs" dir="ltr">${escapeHtml(st.nationalId)}</span>`
                          : `<span class="text-slate-500 text-xs italic">غير مسجل</span>`
                      }
                    </td>
                    <td class="py-2.5 px-3 text-center">
                      <span class="px-2.5 py-0.5 rounded-md text-xs font-bold inline-flex items-center gap-1 ${
                        isDone 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                      }">
                        ${isDone ? 'تم السحب ✅' : 'قيد المتابعة ⏳'}
                      </span>
                    </td>
                    <td class="py-2.5 px-3">
                      ${
                        st.notes && st.notes.trim().length > 0
                          ? `<span class="text-amber-200 text-xs font-medium">${escapeHtml(st.notes)}</span>`
                          : `<span class="text-slate-500 italic text-xs">لا توجد ملاحظات مسجلة بعد</span>`
                      }
                    </td>
                    <td class="py-2.5 px-3 text-center text-xs font-mono text-slate-400">
                      ${isDone ? formattedTime : '-'}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>

        </div>

      </div>
    `;
  }).join("");
}

// حذف كشف صادر
async function handleDeleteOutgoingRequest(requestId, event) {
  if (event) event.stopPropagation();
  if (confirm("هل أنت متأكد من رغبتك في حذف هذا الكشف الصادر نهائياً؟")) {
    await window.firebaseService.deleteWithdrawalRequest(requestId);
    showToast("تم الحذف 🗑️", "تم حذف الكشف الصادر بنجاح", "info");
    updateDashboardData();
  }
}

// ==========================================
// 10. مركز الإشعارات والتنبيهات الحية
// ==========================================

function isNotificationForCurrentUser(notif) {
  if (!currentUser || !notif) return false;
  const userPhoneClean = cleanPhoneNumber(currentUser.phone);
  const userUniNorm = normalizeArabic(currentUser.university || "");

  const matchesIdentity = (
    notif.recipientUserId === currentUser.id ||
    notif.recipientUserId === currentUser.phone ||
    notif.recipientUserId === userPhoneClean ||
    notif.recipientUserId === ("usr_" + userPhoneClean)
  );

  const notifSenderExcluded =
    (notif.senderUserId && notif.senderUserId === currentUser.id) ||
    (notif.senderPhone && userPhoneClean && cleanPhoneNumber(notif.senderPhone) === userPhoneClean);

  const isNewRequest = (notif.type || "") === "new_request";

  // 1) مرشح: الإشعار موجه لمستخدم معين (recipientUserId)
  if (matchesIdentity) {
    if (isNewRequest && notifSenderExcluded) return false; // المرسل لا يرى "واردكم كشف" عن طلبه
    if (isNewRequest && notif.targetUniversity) {
      if (normalizeArabic(notif.targetUniversity) !== userUniNorm) return false;
    }
    return true;
  }

  // 2) مرشح: الإشعار موجه لجامعة بأكملها (recipientUniversity) — حد الأمان للطلبات
  const recipientUni = String(notif.recipientUniversity || "").trim();
  if (recipientUni && normalizeArabic(recipientUni) === userUniNorm) {
    if (isNewRequest && notifSenderExcluded) return false;
    if (isNewRequest && notif.targetUniversity) {
      if (normalizeArabic(notif.targetUniversity) !== userUniNorm) return false;
    }
    return true;
  }

  return false;
}

function renderNotifications() {
  const container = document.getElementById("notificationsListContainer");
  const emptyState = document.getElementById("notificationsEmptyState");
  const badge = document.getElementById("unreadNotifsBadge");
  if (!container || !currentUser) return;

  const userNotifs = allNotifications.filter((n) => isNotificationForCurrentUser(n));
  const unreadCount = userNotifs.filter((n) => !n.isRead).length;

  if (badge) {
    if (unreadCount > 0) {
      badge.innerText = unreadCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  if (userNotifs.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  container.innerHTML = userNotifs.map((n) => {
    const isUnread = !n.isRead;
    const timeAgo = getTimeAgoArabic(n.createdAt);

    let iconClass = "fa-bell text-amber-400";
    if (n.type === "status_changed") iconClass = "fa-circle-check text-emerald-400";
    if (n.type === "notes_updated") iconClass = "fa-pen-to-square text-blue-400";
    if (n.type === "new_request") iconClass = "fa-envelope text-purple-400";

    return `
      <div 
        onclick="handleNotificationClick('${n.id}', '${n.requestId}')" 
        class="notification-item p-2.5 rounded-xl border border-white/5 cursor-pointer ${
          isUnread ? 'unread' : 'bg-slate-900/40'
        }"
      >
        <div class="flex items-start gap-2">
          <i class="fa-solid ${iconClass} mt-1 text-xs"></i>
          <div class="flex-1 text-right">
            <p class="text-xs text-slate-100 leading-relaxed font-semibold">
              ${escapeHtml(n.message)}
            </p>
            <span class="text-[10px] text-slate-400 font-mono mt-0.5 block">${timeAgo}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function toggleNotificationsModal() {
  const modal = document.getElementById("notificationsModal");
  if (!modal) return;
  modal.classList.toggle("hidden");
  if (!modal.classList.contains("hidden")) {
    renderNotifications();
  }
}

async function handleNotificationClick(notifId, requestId) {
  await window.firebaseService.markNotificationAsRead(notifId);
  renderNotifications();
  toggleNotificationsModal();

  if (requestId) {
    switchMainView("dashboard");
    switchDashTab("outgoing");
  }
}

async function markAllNotifsAsRead() {
  if (!currentUser) return;
  await window.firebaseService.markAllNotificationsAsRead(currentUser.id);
  renderNotifications();
  showToast("تم التحديد", "تم تمييز جميع الإشعارات كمقروءة", "info");
}

function getTimeAgoArabic(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${days} يوم`;
}

function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

    gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start();
    osc1.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // ignore
  }
}

// ==========================================
// 11. تنسيق الطلاب ورسائل الواتساب
// ==========================================

function formatStudentsToNumberedPoints(rawText) {
  if (!rawText) return "";

  let items = [];
  if (!rawText.includes("\n") && (rawText.includes("،") || rawText.includes(",") || rawText.includes("؛"))) {
    items = rawText.split(/[،,؛]+/);
  } else {
    items = rawText.split(/\r?\n/);
  }

  const cleaned = [];
  items.forEach((line) => {
    let cleanLine = line.trim();
    if (!cleanLine) return;
    cleanLine = cleanLine.replace(/^[\(\[\{]?[\d٠-٩]{1,3}[\)\]\}]?[\.\-\:\s]+/, "");
    cleanLine = cleanLine.replace(/^[-*•،,؛\s]+/, "");
    cleanLine = cleanLine.trim();
    if (cleanLine.length > 0) {
      cleaned.push(cleanLine);
    }
  });

  return cleaned.map((student, index) => `${index + 1}. ${student}`).join("\n");
}

function extractStudentsArray(rawText) {
  if (!rawText) return [];
  let items = [];
  if (!rawText.includes("\n") && (rawText.includes("،") || rawText.includes(",") || rawText.includes("؛"))) {
    items = rawText.split(/[،,؛]+/);
  } else {
    items = rawText.split(/\r?\n/);
  }

  const cleaned = [];
  items.forEach((line) => {
    let cleanLine = line.trim();
    if (!cleanLine) return;
    cleanLine = cleanLine.replace(/^[\(\[\{]?[\d٠-٩]{1,3}[\)\]\}]?[\.\-\:\s]+/, "");
    cleanLine = cleanLine.replace(/^[-*•،,؛\s]+/, "");
    cleanLine = cleanLine.trim();
    if (cleanLine.length > 0) {
      cleaned.push(cleanLine);
    }
  });

  return cleaned;
}

// ==========================================
// الرقم القومي: استخراجه تلقائياً من سطر الاسم
// الصيغ المدعومة (كلها تلقائية بدون فصل يدوي):
//   لصق إكسيل عمودين: "اسم الطالب<TAB>31234567890123" أو "31234567890123<TAB>اسم الطالب"
//   "اسم الطالب 31234567890123"
//   "اسم الطالب | 31234567890123"
//   "اسم الطالب - ٢١٠١٠١٠١٠١٠١٢٣"
//   "3120 3010 1010 1234" (الرقم مقسم لمجموعات بمسافات أو شرطات)
// ==========================================

function extractNationalIdFromLine(line) {
  const englishDigits = convertArabicNumeralsToEnglish(String(line || ""));

  // اختيار أفضل مرشّح: الأقرب للطول الرسمي 14 خانة (النطاق المقبول 12-15)
  const pickBest = (candidates) => {
    let best = "";
    (candidates || []).forEach((r) => {
      if (!best || Math.abs(r.length - 14) < Math.abs(best.length - 14)) best = r;
    });
    return best;
  };

  // 1) رقماً متصلاً في السطر
  const best = pickBest(String(englishDigits).match(/[0-9]{12,15}/g) || []);
  if (best) return best;

  // 2) لصق من الإكسيل قد يفصل الرقم لمجموعات بمسافات أو شرطات — دمج المجموعات المتجاورة (13-15 خانة)
  const groups = String(englishDigits).split(/[^0-9]+/).filter((g) => g);
  let merged = "";
  for (let i = 0; i < groups.length; i++) {
    let acc = "";
    for (let j = i; j < groups.length; j++) {
      acc += groups[j];
      if (acc.length > 15) break;
      if (acc.length >= 13) {
        if (!merged || Math.abs(acc.length - 14) < Math.abs(merged.length - 14)) merged = acc;
      }
    }
  }
  return merged;
}

function parseStudentEntryWithNationalId(rawLine) {
  let line = String(rawLine || "").trim();
  if (!line) return { name: "", nationalId: "" };

  let nationalId = "";

  // فاصل صريح | بين الاسم والرقم القومي
  if (line.includes("|")) {
    const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
    const withDigits = parts.filter((p) => /\d/.test(convertArabicNumeralsToEnglish(p)));
    const nameParts = parts.filter((p) => !/\d/.test(convertArabicNumeralsToEnglish(p)));
    if (withDigits.length > 0) {
      nationalId = extractNationalIdFromLine(withDigits[0]);
    }
    line = nameParts.length > 0 ? nameParts.join(" ") : line.replace(/\|/g, " ");
  }

  // الرقم القومي في أي موضع بالسطر (قبله أو بعده كعمود إكسيل)
  if (!nationalId) {
    nationalId = extractNationalIdFromLine(line);
  }

  if (nationalId) {
    // إزالة الرقم القومي من نص الاسم مع تسامح الفواصل/المسافات بين مجموعات الرقم
    const englishedLine = convertArabicNumeralsToEnglish(line);
    const nidFuzzy = new RegExp(nationalId.split("").map((d) => `[${d}]`).join("[\\s\\-\\./]?"), "g");
    let cleaned = englishedLine.replace(nidFuzzy, " ");
    // تنظيف خطوط الفصل المتروكة (تاب من عمود الإكسيل، شرطة، نقطتان)
    cleaned = cleaned.replace(/[|]+/g, " ");
    cleaned = cleaned.replace(/\s+[-–—:]+\s*/g, " ");
    cleaned = cleaned.replace(/^[-–—:\s]+|[-–—:\s]+$/g, "");
    line = cleaned.trim();
  }

  return {
    name: line.replace(/\s+/g, " ").trim(),
    nationalId
  };
}

function extractStudentsDetailed(rawText) {
  return extractStudentsArray(rawText)
    .map(parseStudentEntryWithNationalId)
    .filter((entry) => entry.name || entry.nationalId);
}

function countStudentsInText(text) {
  if (!text) return 0;
  if (!text.includes("\n") && (text.includes("،") || text.includes(",") || text.includes("؛"))) {
    return text.split(/[،,؛]+/).filter((l) => l.trim().length > 0).length;
  }
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

function generateWhatsAppMessageText(universityName, rawStudentsText) {
  const formattedNumberedStudents = formatStudentsToNumberedPoints(rawStudentsText);
  const studentsBody = formattedNumberedStudents.length > 0 
    ? formattedNumberedStudents 
    : "(برجاء إدراج أسماء الطلاب)";

  const senderSignature = currentUser 
    ? `${currentUser.fullName}\n${currentUser.jobTitle} - ${currentUser.university}`
    : `مهندس بولس سمير\nمدير شئون الطلاب - جامعة اللوتس`;

  return `الساده مسئول شئون طلاب جامعة ${universityName}
تحية طيبة وبعد،

برجاء من سيادتكم سحب الاطلاب الاتي :
${studentsBody}

شاكرين لسيادتكم وافر التعاون والتقدير.
${senderSignature}`;
}

// ==========================================
// 12. معاينة وطباعة الكشف الرسمي (بدون أي توقيعات في الأسفل)
// ==========================================

function openPrintReportModal(requestId) {
  const req = allRequests.find((r) => r.id === requestId);
  if (!req) return;

  const modal = document.getElementById("printReportModal");
  const container = document.getElementById("printSheetContainer");
  if (!modal || !container) return;

  const students = req.students || [];
  const today = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // الطباعة الرسمية: بدون أي توقيعات من الأسفل بناءً على طلب المستخدم
  container.innerHTML = `
    <div class="border-b-2 border-slate-900 pb-3 mb-4">
      <div class="flex items-center justify-between mb-2">
        <div class="text-right leading-tight">
          <p class="font-bold text-sm">جمهورية مصر العربية</p>
          <p class="text-xs text-slate-700">وزارة التعليم العالي والبحث العلمي</p>
          <p class="text-xs font-bold text-amber-700 mt-0.5">${escapeHtml(req.targetUniversity)}</p>
        </div>
        <div class="text-center">
          <h2 class="text-lg font-black text-slate-900">إدارة شئون الطلاب</h2>
          <h3 class="text-xs font-bold text-slate-700">كشف سحب ملفات الطلاب</h3>
        </div>
        <div class="text-left font-mono text-xs">
          <p>التاريخ: ${today}</p>
          <p>الكود: ${req.id}</p>
        </div>
      </div>
    </div>

    <div class="mb-3 text-xs font-bold leading-relaxed">
      <p>الجامعة الطالبة: <span class="font-black">${escapeHtml(req.senderUniversity)}</span></p>
      <p>المسؤول المرسل: <span>${escapeHtml(req.senderName)}</span> (هاتف: <span dir="ltr">${escapeHtml(req.senderPhone)}</span>)</p>
    </div>

    <table class="w-full text-right border border-slate-400 text-xs my-3">
      <thead>
        <tr class="bg-slate-100 border-b border-slate-400 font-bold">
          <th class="p-2 border border-slate-400 w-10 text-center">م</th>
          <th class="p-2 border border-slate-400">اسم الطالب</th>
          <th class="p-2 border border-slate-400 text-center w-32">الرقم القومي</th>
          <th class="p-2 border border-slate-400 text-center w-24">حالة السحب</th>
          <th class="p-2 border border-slate-400">الملاحظات</th>
        </tr>
      </thead>
      <tbody>
        ${students.map((st, i) => `
          <tr class="border-b border-slate-300">
            <td class="p-2 border border-slate-400 text-center font-bold">${i + 1}</td>
            <td class="p-2 border border-slate-400 font-bold">${escapeHtml(st.name)}</td>
            <td class="p-2 border border-slate-400 text-center font-mono" dir="ltr">${escapeHtml(st.nationalId || '-')}</td>
            <td class="p-2 border border-slate-400 text-center font-bold">
              ${st.isCompleted ? 'تم السحب ✅' : 'قيد السحب ⏳'}
            </td>
            <td class="p-2 border border-slate-400">${escapeHtml(st.notes || '-')}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  modal.classList.remove("hidden");
}

function closePrintModal() {
  const modal = document.getElementById("printReportModal");
  if (modal) modal.classList.add("hidden");
}

// ==========================================
// 13. Toast Alert Notification
// ==========================================
let toastTimeout = null;
function showToast(title, message, type = "success") {
  const toast = document.getElementById("toastAlert");
  const toastTitle = document.getElementById("toastTitle");
  const toastMessage = document.getElementById("toastMessage");
  const toastIcon = document.getElementById("toastIcon");

  if (!toast || !toastTitle || !toastMessage || !toastIcon) return;

  toastTitle.innerText = title;
  toastMessage.innerText = message;

  if (type === "success") {
    toastIcon.className = "w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs";
    toastIcon.innerHTML = `<i class="fa-solid fa-check"></i>`;
  } else if (type === "error") {
    toastIcon.className = "w-7 h-7 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs";
    toastIcon.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
  } else {
    toastIcon.className = "w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs";
    toastIcon.innerHTML = `<i class="fa-solid fa-info"></i>`;
  }

  toast.classList.remove("translate-y-24", "opacity-0", "pointer-events-none");
  toast.classList.add("translate-y-0", "opacity-100");

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("translate-y-0", "opacity-100");
    toast.classList.add("translate-y-24", "opacity-0", "pointer-events-none");
  }, 3500);
}
