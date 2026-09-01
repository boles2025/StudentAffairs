/**
 * تطبيق شئون طلاب الجامعات الخاصة والأهلية
 * إدارة التسجيل، البحث، تنسيق رسائل الواتساب، والترقيم التسلسلي
 * تصميم: مهندس بولس سمير - مدير شئون الطلاب جامعة اللوتس
 */

// متغيرات الحالة العامة للتطبيق
let allRepresentatives = [];
let filteredRepresentatives = [];
let currentSearchQuery = "";
let activeView = "register"; // 'register' أو 'dashboard' أو 'admin'

// متغيرات لوحة تحكم الإدارة (Admin)
let isAdminAuthenticated = false;
let adminSearchQuery = "";
let adminFilteredRepresentatives = [];
const ADMIN_SECRET_PIN = "8520";

// تهيئة التطبيق عند اكتمال تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
  // فحص الجلسة للإدارة
  if (sessionStorage.getItem("admin_auth") === "true") {
    isAdminAuthenticated = true;
  }
  setupUniversityDatalist();
  setupPhoneInputFormatting();
  initFirebaseSubscription();
});

// ملء قائمة الجامعات في الـ Datalist للاختيار والبحث الذكي
function setupUniversityDatalist() {
  const datalist = document.getElementById("universitiesList");
  if (!datalist || typeof EGYPTIAN_UNIVERSITIES === "undefined") return;

  datalist.innerHTML = "";
  EGYPTIAN_UNIVERSITIES.forEach((uni) => {
    const option = document.createElement("option");
    option.value = uni;
    datalist.appendChild(option);
  });
}

// تحسين إدخال رقم الموبايل ومعالجة الأرقام العربية تلقائياً
function setupPhoneInputFormatting() {
  const phoneInput = document.getElementById("phoneInput");
  if (!phoneInput) return;

  phoneInput.addEventListener("input", (e) => {
    // تحويل الأرقام المكتوبة بالهندية/العربية (٠-٩) إلى أرقام إنجليزية (0-9)
    let val = convertArabicNumeralsToEnglish(e.target.value);
    // السماح فقط بالأرقام وعلامة الزائد
    val = val.replace(/[^\d+]/g, "");
    e.target.value = val;

    validatePhoneField(val);
  });
}

// دالة تحويل الأرقام العربية/الهندية إلى أرقام لاتينية
function convertArabicNumeralsToEnglish(str) {
  if (!str) return "";
  const arabicNumerals = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.replace(/[٠-٩]/g, (w) => arabicNumerals.indexOf(w));
}

// التحقق من صحة رقم الموبايل المصري
function validatePhoneField(phone) {
  const phoneError = document.getElementById("phoneError");
  const cleaned = cleanPhoneNumber(phone);
  
  // يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ومكون من 11 رقم
  const isValid = /^01[0125][0-9]{8}$/.test(cleaned);
  
  if (phone.length > 0 && !isValid && phone.length >= 11) {
    phoneError.classList.remove("hidden");
    return false;
  } else {
    phoneError.classList.add("hidden");
    return isValid;
  }
}

// تنظيف وتوحيد صيغة رقم الموبايل
function cleanPhoneNumber(phone) {
  if (!phone) return "";
  let p = convertArabicNumeralsToEnglish(phone).replace(/\D/g, "");
  // إذا كان يبدأ بكود مصر 2001 -> 01
  if (p.startsWith("20") && p.length === 12) {
    p = p.substring(2);
  }
  return p;
}

// تحويل رقم الموبايل إلى صيغة دولية للواتساب (+2010XXXXXXXX)
function getWhatsAppPhoneNumber(phone) {
  let cleaned = cleanPhoneNumber(phone);
  if (cleaned.startsWith("0")) {
    cleaned = "2" + cleaned; // إضافة 2 لمصر (201XXXXXXXXX)
  } else if (!cleaned.startsWith("20")) {
    cleaned = "20" + cleaned;
  }
  return cleaned;
}

// التحقق من الاسم الثلاثي (3 مقاطع على الأقل)
function validateFullName(name) {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/).filter((part) => part.length > 1);
  return parts.length >= 3;
}

// التبديل بين شاشة التسجيل وشاشة السجل وشاشة الإدارة
function switchView(view) {
  activeView = view;
  const registerView = document.getElementById("registerView");
  const dashboardView = document.getElementById("dashboardView");
  const adminView = document.getElementById("adminView");
  const navRegisterBtn = document.getElementById("navRegisterBtn");
  const navDashboardBtn = document.getElementById("navDashboardBtn");

  // إذا كان المطلوب الانتقال للوحة الإدارة
  if (view === "admin") {
    if (!isAdminAuthenticated && sessionStorage.getItem("admin_auth") !== "true") {
      openAdminAuthModal();
      return;
    }
    isAdminAuthenticated = true;
    if (registerView) registerView.classList.add("hidden");
    if (dashboardView) dashboardView.classList.add("hidden");
    if (adminView) adminView.classList.remove("hidden");

    if (navRegisterBtn) navRegisterBtn.className = "px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 text-slate-300 hover:text-white";
    if (navDashboardBtn) navDashboardBtn.className = "px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 text-slate-300 hover:text-white";

    // تحديث إحصائيات الإدارة والجدول فوراً
    updateAdminStats();
    renderAdminTable();
    return;
  }

  // إخفاء لوحة الإدارة عند التبديل للشاشات العادية
  if (adminView) adminView.classList.add("hidden");

  if (view === "register") {
    if (registerView) registerView.classList.remove("hidden");
    if (dashboardView) dashboardView.classList.add("hidden");

    // تحديث أزرار التنقل
    if (navRegisterBtn) navRegisterBtn.className = "px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 bg-amber-500 text-slate-950 shadow-md";
    if (navDashboardBtn) navDashboardBtn.className = "px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 text-slate-300 hover:text-white";
  } else {
    if (registerView) registerView.classList.add("hidden");
    if (dashboardView) dashboardView.classList.remove("hidden");

    if (navDashboardBtn) navDashboardBtn.className = "px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 bg-amber-500 text-slate-950 shadow-md";
    if (navRegisterBtn) navRegisterBtn.className = "px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 text-slate-300 hover:text-white";

    // إعادة تطبيق الفلترة والتحديث
    renderRecords();
  }
}

// معالجة إرسال نموذج التسجيل الجديد
async function handleFormSubmit(e) {
  e.preventDefault();

  const fullNameInput = document.getElementById("fullNameInput");
  const phoneInput = document.getElementById("phoneInput");
  const universityInput = document.getElementById("universityInput");
  const fullNameError = document.getElementById("fullNameError");
  const phoneError = document.getElementById("phoneError");
  const submitBtn = document.getElementById("submitBtn");

  const fullName = fullNameInput.value.trim();
  const rawPhone = phoneInput.value.trim();
  const university = universityInput.value.trim();

  // التحقق من الاسم ثلاثي
  if (!validateFullName(fullName)) {
    fullNameError.classList.remove("hidden");
    fullNameInput.focus();
    return;
  }
  fullNameError.classList.add("hidden");

  // التحقق من رقم الموبايل
  const cleanedPhone = cleanPhoneNumber(rawPhone);
  if (!/^01[0125][0-9]{8}$/.test(cleanedPhone)) {
    phoneError.classList.remove("hidden");
    phoneInput.focus();
    return;
  }
  phoneError.classList.add("hidden");

  // التحقق من اسم الجامعة
  if (!university) {
    showToast("تنبيه", "يرجى كتابة أو تحديد اسم الجامعة", "error");
    universityInput.focus();
    return;
  }

  // إذا كان اسم الجامعة مدخلاً يدوياً وغير موجود في القائمة، يتم قبوله وإضافته فوراً
  if (typeof EGYPTIAN_UNIVERSITIES !== "undefined" && !EGYPTIAN_UNIVERSITIES.includes(university)) {
    EGYPTIAN_UNIVERSITIES.unshift(university);
    setupUniversityDatalist();
  }

  // تعطيل الزر أثناء الحفظ
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xl"></i><span>جاري الحفظ في السحابة...</span>`;

  try {
    const representativeData = {
      fullName: fullName,
      phone: cleanedPhone,
      whatsappPhone: getWhatsAppPhoneNumber(cleanedPhone),
      university: university,
      studentsList: ""
    };

    await window.firebaseService.add(representativeData);

    // إعادة تهيئة النموذج
    e.target.reset();

    showToast("تم التسجيل بنجاح! 🎉", `تم تسجيل ${fullName} كمسؤول لشئون طلاب ${university}`, "success");

    // الانتقال التلقائي المباشر لشاشة السجل كما طلب المستخدم
    setTimeout(() => {
      switchView("dashboard");
    }, 400);

  } catch (error) {
    console.error("Registration error:", error);
    showToast("خطأ", "حدث خطأ أثناء حفظ البيانات، يرجى المحاولة ثانية", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

// الاشتراك في تحديثات Firebase الفورية
function initFirebaseSubscription() {
  const connectionBadge = document.getElementById("connectionBadge");
  const connectionText = document.getElementById("connectionText");

  window.firebaseService.subscribe((data, isCloud) => {
    allRepresentatives = data || [];
    
    // تحديث الشارة إن وجدت
    if (connectionBadge && connectionText) {
      if (isCloud) {
        connectionBadge.className = "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold";
        connectionText.innerText = "قاعدة البيانات متصلة ومحدثة 🟢";
      } else {
        connectionBadge.className = "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold";
        connectionText.innerText = "يعمل بالذاكرة المحلية 🟡";
      }
    }

    // تحديث العداد
    const counterBadge = document.getElementById("recordsCounterBadge");
    if (counterBadge) counterBadge.innerText = allRepresentatives.length;

    // تطبيق البحث الحالي والرندر
    applyFilter();

    // تحديث شاشة الإدارة إذا كانت مفتوحة
    if (activeView === "admin") {
      updateAdminStats();
      renderAdminTable();
    }
  });
}

// معالجة البحث الفوري
function handleSearch(query) {
  currentSearchQuery = query;
  const clearBtn = document.getElementById("clearSearchBtn");
  if (clearBtn) {
    if (query.trim().length > 0) {
      clearBtn.classList.remove("hidden");
    } else {
      clearBtn.classList.add("hidden");
    }
  }
  applyFilter();
}

// مسح البحث
function clearSearch() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = "";
  currentSearchQuery = "";
  const clearBtn = document.getElementById("clearSearchBtn");
  if (clearBtn) clearBtn.classList.add("hidden");
  applyFilter();
}

// تطبيع النصوص العربية والأرقام لتسهيل البحث الذكي الشامل
function normalizeArabic(text) {
  if (!text) return "";
  let str = convertArabicNumeralsToEnglish(text.toString()).toLowerCase();
  return str
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // إزالة التشكيل
    .replace(/[^\w\s\u0600-\u06FF]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// تطبيق الفلتر على السجلات بذكاء فوري وشامل بأي جزء من الكلمة
function applyFilter() {
  if (!currentSearchQuery || currentSearchQuery.trim() === "") {
    filteredRepresentatives = [...allRepresentatives];
  } else {
    // تجزئة الكلمات المكتوبة في البحث
    const qNormalized = normalizeArabic(currentSearchQuery);
    const searchTerms = qNormalized.split(/\s+/).filter((w) => w.length > 0);

    filteredRepresentatives = allRepresentatives.filter((item) => {
      // جمع كل تفاصيل السجل في نص شامل واحد للمطابقة الفورية
      const fullRecordText = normalizeArabic(
        `${item.fullName || ""} ${item.phone || ""} ${item.university || ""} ${item.studentsList || ""}`
      );
      // التأكد من أن كل جزء أو كلمة في البحث موجودة داخل بيانات السجل
      return searchTerms.every((term) => fullRecordText.includes(term));
    });
  }

  const countBadge = document.getElementById("filteredCount");
  if (countBadge) countBadge.innerText = filteredRepresentatives.length;

  renderRecords();
}

// تحويل أي نص (منسوخ أو مكتوب) إلى نقاط تسلسلية مرقمة 1. 2. 3.
function formatStudentsToNumberedPoints(rawText) {
  if (!rawText) return "";

  // فحص ما إذا كان النص سطراً واحداً ومفصولاً بفواصل مثل ، أو , أو ؛
  let items = [];
  if (!rawText.includes("\n") && (rawText.includes("،") || rawText.includes(",") || rawText.includes("؛"))) {
    items = rawText.split(/[،,؛]+/);
  } else {
    items = rawText.split(/\r?\n/);
  }

  const cleanedStudents = [];

  items.forEach((line) => {
    let cleanLine = line.trim();
    if (!cleanLine) return;

    // تنظيف أي ترقيم سابق مثل "1.", "1 -", "-", "*", "•", "(1)", "1)"
    cleanLine = cleanLine.replace(/^[\(\[\{]?[\d٠-٩]+[\)\]\}]?[\.\-\:\s]+/, "");
    cleanLine = cleanLine.replace(/^[-*•،,؛\s]+/, "");
    cleanLine = cleanLine.trim();

    if (cleanLine.length > 0) {
      cleanedStudents.push(cleanLine);
    }
  });

  // إعادة الترقيم التسلسلي
  return cleanedStudents.map((student, index) => `${index + 1}. ${student}`).join("\n");
}

// استخراج عدد الطلاب من النص بدقة
function countStudentsInText(text) {
  if (!text) return 0;
  if (!text.includes("\n") && (text.includes("،") || text.includes(",") || text.includes("؛"))) {
    return text.split(/[،,؛]+/).filter((l) => l.trim().length > 0).length;
  }
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

// رندر السجلات في الجدول المنسق (للكمبيوتر) والبطاقات الذكية المستقلة (للهاتف المحمول)
function renderRecords() {
  const tableBody = document.getElementById("recordsTableBody");
  const recordsContainer = document.getElementById("recordsContainer");
  const mobileContainer = document.getElementById("mobileCardsContainer");
  const emptyState = document.getElementById("emptyState");

  if (!tableBody || !emptyState) return;

  if (filteredRepresentatives.length === 0) {
    tableBody.innerHTML = "";
    if (mobileContainer) mobileContainer.innerHTML = "";
    if (recordsContainer) recordsContainer.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  if (recordsContainer) recordsContainer.classList.remove("hidden");

  // 1. توليد صفوف الجدول المنسق بالأعمدة (للشاشات الكبيرة والمتوسطة md فأعلى)
  tableBody.innerHTML = filteredRepresentatives.map((rep, idx) => {
    const studentCount = countStudentsInText(rep.studentsList || "");

    return `
      <tr class="hover:bg-slate-800/40 transition-colors border-b border-white/5" id="row-${rep.id}">
        <!-- 1. # -->
        <td class="py-4 px-3 text-center text-slate-400 font-mono font-bold text-xs align-middle">
          ${idx + 1}
        </td>

        <!-- 2. الجامعة -->
        <td class="py-4 px-4 align-middle">
          <div class="flex items-center gap-2.5">
            <span class="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <i class="fa-solid fa-landmark text-base"></i>
            </span>
            <span class="font-extrabold text-white text-base leading-snug">
              ${escapeHtml(rep.university)}
            </span>
          </div>
        </td>

        <!-- 3. اسم المسؤول -->
        <td class="py-4 px-4 align-middle">
          <div class="flex items-center gap-2 text-slate-100 font-bold text-sm">
            <div class="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-amber-300 text-xs shadow-inner">
              <i class="fa-solid fa-user-tie"></i>
            </div>
            <span>${escapeHtml(rep.fullName)}</span>
          </div>
        </td>

        <!-- 4. رقم الموبايل -->
        <td class="py-4 px-4 align-middle whitespace-nowrap">
          <div class="flex items-center gap-2">
            <a 
              href="tel:${rep.phone}" 
              class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-emerald-400 font-mono font-bold text-sm flex items-center gap-2 transition-colors"
              title="اتصال هاتفي"
            >
              <i class="fa-solid fa-phone text-xs"></i>
              <span dir="ltr">${escapeHtml(rep.phone)}</span>
            </a>
            <button 
              onclick="copyToClipboard('${rep.phone}', 'تم نسخ رقم الموبايل')" 
              class="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer text-xs"
              title="نسخ الرقم"
            >
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
        </td>

        <!-- 5. أسماء الطلاب المراد سحبهم -->
        <td class="py-4 px-4 align-top min-w-[480px]">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <i class="fa-solid fa-users text-amber-400"></i>
                <span>أسماء الطلاب المراد سحبهم:</span>
              </span>
              <span id="badge-count-${rep.id}" class="px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-white/10 font-mono text-xs font-bold">
                ${studentCount} ${studentCount === 1 ? 'طالب' : 'طلاب'}
              </span>
            </div>
            <textarea 
              id="students-input-${rep.id}"
              oninput="onStudentsInputChanged('${rep.id}', false)"
              placeholder="ألصق أو اكتب أسماء الطلاب هنا (يقبل النسخ واللصق من إكسيل، طالب في كل سطر)..."
              class="students-textarea glass-input w-full p-3.5 rounded-2xl text-sm placeholder-slate-500 text-slate-100 min-h-[120px] resize-y leading-relaxed"
              rows="4"
            >${escapeHtml(rep.studentsList || '')}</textarea>
          </div>
        </td>

        <!-- 6. زر إرسال الواتس فقط -->
        <td class="py-4 px-3 align-middle text-center w-28">
          <button 
            onclick="sendViaWhatsApp('${rep.id}', false)"
            class="btn-whatsapp py-2 px-3 rounded-xl inline-flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer hover:scale-105 transition-all whitespace-nowrap"
            title="إرسال طلب السحب للواتس"
          >
            <i class="fa-brands fa-whatsapp text-sm"></i>
            <span>إرسال 📲</span>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // 2. توليد البطاقات الذكية المتوافقة 100% مع الهواتف الذكية (أقل من md)
  if (mobileContainer) {
    mobileContainer.innerHTML = filteredRepresentatives.map((rep, idx) => {
      const studentCount = countStudentsInText(rep.studentsList || "");

      return `
        <div class="glass-card rounded-2xl p-4 border border-white/10 space-y-3.5 shadow-xl" id="mobile-card-${rep.id}">
          <!-- رأس الكرت: اسم الجامعة والمسؤول والترتيب -->
          <div class="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
            <div class="flex items-start gap-2.5">
              <span class="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 text-sm mt-0.5">
                <i class="fa-solid fa-landmark"></i>
              </span>
              <div>
                <span class="font-extrabold text-white text-base block leading-snug">
                  ${escapeHtml(rep.university)}
                </span>
                <span class="text-xs text-slate-300 font-semibold flex items-center gap-1.5 mt-1">
                  <i class="fa-solid fa-user-tie text-amber-400 text-xs"></i>
                  <span>${escapeHtml(rep.fullName)}</span>
                </span>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full bg-slate-800 border border-white/10 text-amber-300 font-mono font-bold text-xs">
              #${idx + 1}
            </span>
          </div>

          <!-- شريط الاتصال السريع ونسخ الهاتف -->
          <div class="flex items-center justify-between gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-white/5">
            <a 
              href="tel:${rep.phone}" 
              class="text-emerald-400 font-mono font-bold text-xs flex items-center gap-2"
              title="اتصال هاتفي مباشر"
            >
              <span class="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
                <i class="fa-solid fa-phone"></i>
              </span>
              <span dir="ltr">${escapeHtml(rep.phone)}</span>
            </a>
            <button 
              onclick="copyToClipboard('${rep.phone}', 'تم نسخ رقم الموبايل')" 
              class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors border border-white/5"
            >
              <i class="fa-regular fa-copy text-xs"></i>
              <span>نسخ الرقم</span>
            </button>
          </div>

          <!-- مساحة كتابة أسماء الطلاب المريحة لشاشة الموبايل -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <label class="font-bold text-amber-300 flex items-center gap-1.5">
                <i class="fa-solid fa-users text-amber-400"></i>
                <span>أسماء الطلاب المراد سحبهم:</span>
              </label>
              <span id="badge-count-mobile-${rep.id}" class="px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono text-[11px] font-bold border border-white/10">
                ${studentCount} ${studentCount === 1 ? 'طالب' : 'طلاب'}
              </span>
            </div>
            <textarea 
              id="students-input-mobile-${rep.id}"
              oninput="onStudentsInputChanged('${rep.id}', true)"
              placeholder="اكتب أو ألصق أسماء الطلاب هنا (طالب في كل سطر)..."
              class="students-textarea glass-input w-full p-3 rounded-xl text-base placeholder-slate-500 text-slate-100 min-h-[95px] leading-relaxed"
              rows="3"
            >${escapeHtml(rep.studentsList || '')}</textarea>
          </div>

          <!-- زر إرسال واتساب مخصص للهواتف الذكية -->
          <button 
            onclick="sendViaWhatsApp('${rep.id}', true)"
            class="btn-whatsapp w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-extrabold text-sm shadow-xl cursor-pointer active:scale-95 transition-transform"
          >
            <i class="fa-brands fa-whatsapp text-xl"></i>
            <span>إرسال طلب السحب للواتس 📲</span>
          </button>
        </div>
      `;
    }).join("");
  }
}

// مؤقتات الحفظ التلقائي لمنع كثرة الاستدعاءات
let autoSaveDebounceTimers = {};

// دالة مساعدة للحصول على حقل إدخال الطلاب بحسب وضع العرض النشط
function getStudentsTextarea(id, preferMobile = false) {
  const mobile = document.getElementById(`students-input-mobile-${id}`);
  const desktop = document.getElementById(`students-input-${id}`);
  if (preferMobile && mobile) return mobile;
  if (window.innerWidth < 768 && mobile) return mobile;
  return desktop || mobile;
}

// عند كتابة أو لصق نص في الـ Textarea لأي مسؤول مع مزامنة الموبايل والكمبيوتر
function onStudentsInputChanged(id, isMobile = false) {
  const textarea = getStudentsTextarea(id, isMobile);
  if (!textarea) return;

  const newText = textarea.value;

  // تحديث الذاكرة فوراً ليعمل البحث الحي فوراً
  const rep = allRepresentatives.find((r) => r.id === id);
  if (rep) {
    rep.studentsList = newText;
  }

  // مزامنة الحقل الآخر إن وُجد
  const desktop = document.getElementById(`students-input-${id}`);
  const mobile = document.getElementById(`students-input-mobile-${id}`);
  if (isMobile && desktop) desktop.value = newText;
  if (!isMobile && mobile) mobile.value = newText;

  // تحديث العداد
  const count = countStudentsInText(newText);
  const textStr = `${count} ${count === 1 ? 'طالب' : 'طلاب'}`;
  const badgeCount = document.getElementById(`badge-count-${id}`);
  const badgeCountMobile = document.getElementById(`badge-count-mobile-${id}`);
  if (badgeCount) badgeCount.innerText = textStr;
  if (badgeCountMobile) badgeCountMobile.innerText = textStr;

  // حفظ تلقائي في قاعدة البيانات بعد توقف الإدخال
  if (autoSaveDebounceTimers[id]) clearTimeout(autoSaveDebounceTimers[id]);
  autoSaveDebounceTimers[id] = setTimeout(() => {
    window.firebaseService.update(id, { studentsList: newText });
  }, 600);
}

// ترقيم الأسماء في البطاقة أو الجدول تلقائياً عند الضغط على زر "ترقيم تلقائي"
function autoFormatCardTextarea(id) {
  const textarea = getStudentsTextarea(id);
  if (!textarea) return;

  const formatted = formatStudentsToNumberedPoints(textarea.value);
  if (!formatted) {
    showToast("تنبيه", "يرجى كتابة أو لصق أسماء الطلاب أولاً", "info");
    return;
  }

  textarea.value = formatted;
  onStudentsInputChanged(id);
  // حفظ الترقيم تلقائياً
  window.firebaseService.update(id, { studentsList: formatted });
  showToast("تم الترقيم بنجاح", "تم تنظيف الأسماء وترقيمها تسلسلياً وحفظها", "success");
}

// حفظ قائمة الطلاب في السحابة
async function saveCardStudentsList(id) {
  const textarea = getStudentsTextarea(id);
  if (!textarea) return;

  const content = textarea.value;
  await window.firebaseService.update(id, { studentsList: content });
  showToast("تم الحفظ 💾", "تم حفظ قائمة الطلاب بنجاح في السحابة", "success");
}

// مسح محتوى الـ Textarea
function clearCardTextarea(id) {
  const textarea = getStudentsTextarea(id);
  if (!textarea) return;

  textarea.value = "";
  onStudentsInputChanged(id);
  window.firebaseService.update(id, { studentsList: "" });
}

// صياغة الرسالة الرسمية للواتس بالصيغة الثابتة المعتمدة
function generateWhatsAppMessageText(universityName, rawStudentsText) {
  // الترقيم التسلسلي التلقائي لأسماء الطلاب
  const formattedNumberedStudents = formatStudentsToNumberedPoints(rawStudentsText);

  const studentsBody = formattedNumberedStudents.length > 0 
    ? formattedNumberedStudents 
    : "(برجاء إدراج أسماء الطلاب)";

  // الصيغة الرسمية تنتهي بـ شاكرين لسيادتكم وافر التعاون والتقدير فقط بدون أسماء
  return `الساده مسئول شئون طلاب جامعة ${universityName}
تحية طيبة وبعد،

برجاء من سيادتكم سحب الاطلاب الاتي :
${studentsBody}

شاكرين لسيادتكم وافر التعاون والتقدير`;
}

// إرسال الرسالة مباشرة عبر الواتساب وتفريغ الخانة فوراً لاستقبال أسماء جديدة
function sendViaWhatsApp(id) {
  const rep = allRepresentatives.find((r) => r.id === id);
  if (!rep) return;

  const universityName = rep.university || "";
  const fullName = rep.fullName || "";
  const phone = rep.phone || "";

  const textarea = getStudentsTextarea(id);
  const rawText = textarea ? textarea.value : (rep.studentsList || "");

  // التحقق من وجود أسماء قبل الإرسال
  if (!rawText.trim()) {
    showToast("تنبيه", "يرجى كتابة أو لصق أسماء الطلاب أولاً قبل الإرسال", "error");
    if (textarea) textarea.focus();
    return;
  }

  // تطبيق الترقيم التسلسلي تلقائياً
  const numberedText = formatStudentsToNumberedPoints(rawText);

  // إنشاء الرسالة بالصيغة المعتمدة
  const message = generateWhatsAppMessageText(universityName, numberedText || rawText);

  // استخراج وتجهيز رقم الموبايل للواتساب
  const whatsAppNumber = getWhatsAppPhoneNumber(phone);

  // فتح رابط الواتساب المباشر
  const encodedText = encodeURIComponent(message);
  const waUrl = `https://api.whatsapp.com/send?phone=${whatsAppNumber}&text=${encodedText}`;

  // فتح المحادثة في نافذة جديدة
  window.open(waUrl, "_blank");

  // تفريغ الخانة فوراً بعد الإرسال لتكون جاهزة لاستقبال أسماء أخرى (في الكمبيوتر والموبايل)
  const desktop = document.getElementById(`students-input-${id}`);
  const mobile = document.getElementById(`students-input-mobile-${id}`);
  if (desktop) desktop.value = "";
  if (mobile) mobile.value = "";

  rep.studentsList = "";
  const badgeCount = document.getElementById(`badge-count-${id}`);
  const badgeCountMobile = document.getElementById(`badge-count-mobile-${id}`);
  if (badgeCount) badgeCount.innerText = "0 طلاب";
  if (badgeCountMobile) badgeCountMobile.innerText = "0 طلاب";

  // حفظ تفريغ الخانة في السحابة ومحلياً
  window.firebaseService.update(id, { studentsList: "" });

  showToast("تم إرسال الطلب 📲", "تم إرسال الأسماء وتفريغ الخانة لتكون جاهزة لأسماء جديدة", "success");
}

// نسخ الرسالة الرسمية للحافظة
function copyFormattedWhatsAppMessage(id) {
  const rep = allRepresentatives.find((r) => r.id === id);
  if (!rep) return;

  const universityName = rep.university || "";
  const textarea = getStudentsTextarea(id);
  const rawText = textarea ? textarea.value : (rep.studentsList || "");
  const numberedText = formatStudentsToNumberedPoints(rawText);

  const message = generateWhatsAppMessageText(universityName, numberedText || rawText);
  copyToClipboard(message, "تم نسخ صيغة رسالة الواتساب الرسمية إلى الحافظة!");
}

// تأكيد وحذف السجل
function deleteRepresentativePrompt(id) {
  const rep = allRepresentatives.find((r) => r.id === id);
  const name = rep ? rep.fullName : "المسؤول";

  if (confirm(`هل أنت متأكد من رغبتك في حذف بيانات مسؤول (${name}) نهائياً؟`)) {
    window.firebaseService.delete(id);
    showToast("تم الحذف", `تم حذف سجل ${name} بنجاح`, "info");
  }
}

// نسخ إلى الحافظة
function copyToClipboard(text, successMsg) {
  if (!navigator.clipboard) {
    // طريقة بديلة للمتصفحات القديمة
    const tempInput = document.createElement("textarea");
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    showToast("تم النسخ", successMsg || "تم النسخ بنجاح", "success");
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast("تم النسخ", successMsg || "تم النسخ بنجاح", "success");
  }).catch((err) => {
    console.error("Clipboard copy error:", err);
  });
}

// إظهار إشعار عائم Toast Notification
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
    toastIcon.className = "w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center";
    toastIcon.innerHTML = `<i class="fa-solid fa-check"></i>`;
  } else if (type === "error") {
    toastIcon.className = "w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center";
    toastIcon.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
  } else {
    toastIcon.className = "w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center";
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

// دوال حماية النصوص من الـ XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(str) {
  if (!str) return "";
  return String(str).replace(/'/g, "\\'");
}

/* =========================================================================
   نظام لوحة تحكم الإدارة المركزية (Admin Dashboard - PIN: 8520)
   تصميم: مهندس بولس سمير - مدير شئون الطلاب جامعة اللوتس
   ========================================================================= */

// معالجة النقر المزدوج على العنوان الرئيسي باللمس على الموبايل (Touch Double-Tap)
let lastTitleTouchTime = 0;
function handleTitleTouch(e) {
  const currentTime = Date.now();
  const tapInterval = currentTime - lastTitleTouchTime;
  if (tapInterval < 400 && tapInterval > 50) {
    if (e.cancelable) e.preventDefault();
    handleHeaderDblClick();
  }
  lastTitleTouchTime = currentTime;
}

// معالجة النقر المزدوج على العنوان الرئيسي في الترويسة
function handleHeaderDblClick() {
  if (isAdminAuthenticated || sessionStorage.getItem("admin_auth") === "true") {
    isAdminAuthenticated = true;
    switchView("admin");
  } else {
    openAdminAuthModal();
  }
}

// فتح نافذة التحقق من كلمة مرور الإدارة
function openAdminAuthModal() {
  const modal = document.getElementById("adminAuthModal");
  const input = document.getElementById("adminPasswordInput");
  const errorMsg = document.getElementById("adminPasswordError");

  if (!modal || !input) return;

  input.value = "";
  if (errorMsg) errorMsg.classList.add("hidden");
  modal.classList.remove("hidden");
  setTimeout(() => input.focus(), 150);
}

// إغلاق نافذة التحقق
function closeAdminAuthModal() {
  const modal = document.getElementById("adminAuthModal");
  if (modal) modal.classList.add("hidden");
}

// التحقق من كلمة المرور 8520
function submitAdminPassword() {
  const input = document.getElementById("adminPasswordInput");
  const errorMsg = document.getElementById("adminPasswordError");
  if (!input) return;

  const enteredPin = convertArabicNumeralsToEnglish(input.value.trim());

  if (enteredPin === ADMIN_SECRET_PIN) {
    isAdminAuthenticated = true;
    sessionStorage.setItem("admin_auth", "true");
    closeAdminAuthModal();
    switchView("admin");
    showToast("مرحباً بك في لوحة الإدارة 🛡️", "تم تسجيل الدخول بنجاح بصلاحيات المدير", "success");
  } else {
    if (errorMsg) errorMsg.classList.remove("hidden");
    input.value = "";
    input.focus();
  }
}

// الخروج من لوحة الإدارة
function exitAdminView() {
  isAdminAuthenticated = false;
  sessionStorage.removeItem("admin_auth");
  switchView("dashboard");
  showToast("تم تسجيل الخروج", "تمت العودة إلى السجل العام", "info");
}

// تحديث كروت الإحصائيات الشاملة في الإدارة
function updateAdminStats() {
  const statUnis = document.getElementById("adminStatUniversities");
  const statReps = document.getElementById("adminStatRepresentatives");
  const statStudents = document.getElementById("adminStatStudents");
  const statActiveUnis = document.getElementById("adminStatActiveUnis");

  // 1. إجمالي الجامعات الفريدة
  const uniqueUniversities = new Set(
    allRepresentatives
      .map((r) => (r.university || "").trim())
      .filter((u) => u.length > 0)
  );
  if (statUnis) statUnis.innerText = uniqueUniversities.size;

  // 2. إجمالي المسؤولين
  if (statReps) statReps.innerText = allRepresentatives.length;

  // 3. إجمالي الطلاب في كل الجامعات
  let totalStudents = 0;
  let activeUnisWithStudentsCount = 0;

  allRepresentatives.forEach((rep) => {
    const count = countStudentsInText(rep.studentsList || "");
    totalStudents += count;
    if (count > 0) {
      activeUnisWithStudentsCount++;
    }
  });

  if (statStudents) statStudents.innerText = totalStudents;
  if (statActiveUnis) statActiveUnis.innerText = activeUnisWithStudentsCount;
}

// رندر جدول الإدارة الشامل مع كافة الصلاحيات (للكمبيوتر والهاتف المحمول)
function renderAdminTable() {
  const tableBody = document.getElementById("adminTableBody");
  const adminRecordsContainer = document.getElementById("adminRecordsContainer");
  const mobileContainer = document.getElementById("adminMobileContainer");
  const emptyState = document.getElementById("adminEmptyState");
  const filteredBadge = document.getElementById("adminFilteredCount");

  if (!tableBody) return;

  // فلترة حسب البحث الإداري
  let reps = allRepresentatives;
  if (adminSearchQuery && adminSearchQuery.trim() !== "") {
    const qNorm = normalizeArabic(adminSearchQuery);
    const terms = qNorm.split(/\s+/).filter((t) => t.length > 0);
    reps = allRepresentatives.filter((rep) => {
      const fullText = normalizeArabic(
        `${rep.fullName || ""} ${rep.phone || ""} ${rep.university || ""} ${rep.studentsList || ""}`
      );
      return terms.every((t) => fullText.includes(t));
    });
  }

  adminFilteredRepresentatives = reps;

  if (filteredBadge) {
    filteredBadge.innerText = reps.length;
  }

  if (reps.length === 0) {
    tableBody.innerHTML = "";
    if (mobileContainer) mobileContainer.innerHTML = "";
    if (adminRecordsContainer) adminRecordsContainer.classList.add("hidden");
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");
  if (adminRecordsContainer) adminRecordsContainer.classList.remove("hidden");

  // 1. توليد صفوف الجدول للكمبيوتر (md وما فوق)
  tableBody.innerHTML = reps.map((rep, idx) => {
    const studentCount = countStudentsInText(rep.studentsList || "");
    const cleanStudents = (rep.studentsList || "").trim();

    return `
      <tr class="hover:bg-slate-800/40 transition-colors border-b border-white/5" id="admin-row-${rep.id}">
        <!-- 1. # -->
        <td class="py-3 px-3 text-center text-slate-400 font-mono font-bold text-xs align-middle">
          ${idx + 1}
        </td>

        <!-- 2. الجامعة -->
        <td class="py-3 px-4 align-middle">
          <div class="flex items-center gap-2">
            <span class="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
              <i class="fa-solid fa-landmark"></i>
            </span>
            <span class="font-bold text-white text-sm">
              ${escapeHtml(rep.university)}
            </span>
          </div>
        </td>

        <!-- 3. اسم المسؤول -->
        <td class="py-3 px-4 align-middle font-semibold text-slate-100 text-sm">
          ${escapeHtml(rep.fullName)}
        </td>

        <!-- 4. الموبايل -->
        <td class="py-3 px-4 align-middle whitespace-nowrap">
          <a 
            href="tel:${rep.phone}" 
            class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-mono font-bold text-xs inline-flex items-center gap-1.5 transition-colors border border-white/10"
            title="اتصال"
          >
            <i class="fa-solid fa-phone text-[10px]"></i>
            <span dir="ltr">${escapeHtml(rep.phone)}</span>
          </a>
        </td>

        <!-- 5. عدد الطلاب -->
        <td class="py-3 px-3 text-center align-middle whitespace-nowrap">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
            studentCount > 0 
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
              : 'bg-slate-800 text-slate-400 border border-white/10'
          }">
            ${studentCount} طالب
          </span>
        </td>

        <!-- 6. تفاصيل أسماء الطلاب -->
        <td class="py-3 px-4 align-middle">
          ${
            cleanStudents.length > 0
              ? `<div class="max-h-20 overflow-y-auto custom-scrollbar p-2 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-200 whitespace-pre-line leading-relaxed font-sans">${escapeHtml(cleanStudents)}</div>`
              : `<span class="text-xs text-slate-500 italic">لا توجد أسماء مسجلة حالياً</span>`
          }
        </td>

        <!-- 7. لوحة التحكم والإجراءات -->
        <td class="py-3 px-4 align-middle text-center">
          <div class="flex items-center justify-center gap-1.5">
            <!-- تعديل -->
            <button 
              onclick="openAdminEditModal('${rep.id}')"
              class="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs transition-all cursor-pointer hover:scale-105"
              title="تعديل السجل بالكامل"
            >
              <i class="fa-solid fa-pen-to-square"></i>
            </button>

            <!-- تفريغ الأسماء -->
            <button 
              onclick="adminClearStudents('${rep.id}')"
              class="p-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-xs transition-all cursor-pointer hover:scale-105"
              title="تفريغ قائمة أسماء الطلاب"
            >
              <i class="fa-solid fa-broom"></i>
            </button>

            <!-- حذف -->
            <button 
              onclick="adminDeleteRepresentative('${rep.id}')"
              class="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs transition-all cursor-pointer hover:scale-105"
              title="حذف المسؤول نهائياً"
            >
              <i class="fa-regular fa-trash-can"></i>
            </button>

            <!-- واتساب -->
            <button 
              onclick="sendViaWhatsApp('${rep.id}')"
              class="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs transition-all cursor-pointer hover:scale-105"
              title="إرسال طلب واتساب"
            >
              <i class="fa-brands fa-whatsapp"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // 2. توليد كروت الإدارة للموبايل (أقل من md)
  if (mobileContainer) {
    mobileContainer.innerHTML = reps.map((rep, idx) => {
      const studentCount = countStudentsInText(rep.studentsList || "");
      const cleanStudents = (rep.studentsList || "").trim();

      return `
        <div class="glass-card rounded-2xl p-4 border border-white/10 space-y-3 shadow-lg" id="admin-mobile-${rep.id}">
          <div class="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
            <div>
              <div class="flex items-center gap-2">
                <span class="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs">
                  <i class="fa-solid fa-landmark"></i>
                </span>
                <span class="font-black text-white text-base leading-snug">${escapeHtml(rep.university)}</span>
              </div>
              <p class="text-xs text-slate-300 font-semibold mt-1 flex items-center gap-1.5">
                <i class="fa-solid fa-user-tie text-amber-400/80 text-xs"></i>
                <span>${escapeHtml(rep.fullName)}</span>
              </p>
            </div>
            <span class="px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono text-xs font-bold border border-white/10">
              #${idx + 1}
            </span>
          </div>

          <div class="flex items-center justify-between gap-2 text-xs">
            <a 
              href="tel:${rep.phone}" 
              class="px-3 py-1.5 rounded-xl bg-slate-800 text-emerald-400 font-mono font-bold flex items-center gap-2 border border-white/10"
            >
              <i class="fa-solid fa-phone text-xs"></i>
              <span dir="ltr">${escapeHtml(rep.phone)}</span>
            </a>
            <span class="px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
              studentCount > 0 
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                : 'bg-slate-800 text-slate-400 border border-white/10'
            }">
              ${studentCount} طالب
            </span>
          </div>

          ${
            cleanStudents.length > 0
              ? `<div class="max-h-24 overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-200 whitespace-pre-line leading-relaxed font-sans">${escapeHtml(cleanStudents)}</div>`
              : `<p class="text-xs text-slate-500 italic">لا توجد أسماء مسجلة</p>`
          }

          <!-- أزرار الإجراءات على الموبايل -->
          <div class="grid grid-cols-4 gap-2 pt-2 border-t border-white/10">
            <button 
              onclick="openAdminEditModal('${rep.id}')"
              class="py-2 px-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95"
            >
              <i class="fa-solid fa-pen-to-square text-sm"></i>
              <span class="text-[10px]">تعديل</span>
            </button>
            <button 
              onclick="adminClearStudents('${rep.id}')"
              class="py-2 px-2 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/30 text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95"
            >
              <i class="fa-solid fa-broom text-sm"></i>
              <span class="text-[10px]">مسح</span>
            </button>
            <button 
              onclick="adminDeleteRepresentative('${rep.id}')"
              class="py-2 px-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95"
            >
              <i class="fa-regular fa-trash-can text-sm"></i>
              <span class="text-[10px]">حذف</span>
            </button>
            <button 
              onclick="sendViaWhatsApp('${rep.id}')"
              class="py-2 px-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95"
            >
              <i class="fa-brands fa-whatsapp text-base"></i>
              <span class="text-[10px]">واتس</span>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }
}

// بحث الإدارة
function handleAdminSearch(val) {
  adminSearchQuery = val || "";
  renderAdminTable();
}

// فتح نافذة تعديل بيانات المسؤول
function openAdminEditModal(id) {
  const rep = allRepresentatives.find((r) => r.id === id);
  if (!rep) return;

  const modal = document.getElementById("adminEditModal");
  const repIdInput = document.getElementById("editRepId");
  const nameInput = document.getElementById("editFullNameInput");
  const phoneInput = document.getElementById("editPhoneInput");
  const uniInput = document.getElementById("editUniversityInput");
  const studentsInput = document.getElementById("editStudentsInput");

  if (!modal) return;

  repIdInput.value = rep.id;
  nameInput.value = rep.fullName || "";
  phoneInput.value = rep.phone || "";
  uniInput.value = rep.university || "";
  studentsInput.value = rep.studentsList || "";

  modal.classList.remove("hidden");
}

// إغلاق نافذة التعديل
function closeAdminEditModal() {
  const modal = document.getElementById("adminEditModal");
  if (modal) modal.classList.add("hidden");
}

// حفظ تعديلات المسؤول
async function handleAdminEditSubmit(e) {
  e.preventDefault();
  const repId = document.getElementById("editRepId").value;
  const fullName = document.getElementById("editFullNameInput").value.trim();
  const rawPhone = document.getElementById("editPhoneInput").value.trim();
  const university = document.getElementById("editUniversityInput").value.trim();
  const studentsList = document.getElementById("editStudentsInput").value;
  const saveBtn = document.getElementById("saveEditBtn");

  if (!validateFullName(fullName)) {
    showToast("تنبيه", "يرجى إدخال اسم ثلاثي صحيح (3 مقاطع على الأقل)", "error");
    return;
  }

  const cleanedPhone = cleanPhoneNumber(rawPhone);
  if (!/^01[0125][0-9]{8}$/.test(cleanedPhone)) {
    showToast("تنبيه", "يرجى إدخال رقم موبايل مصري صحيح مكون من 11 رقماً", "error");
    return;
  }

  if (!university) {
    showToast("تنبيه", "يرجى إدخال اسم الجامعة", "error");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>جاري الحفظ...</span>`;

  try {
    const updates = {
      fullName,
      phone: cleanedPhone,
      whatsappPhone: getWhatsAppPhoneNumber(cleanedPhone),
      university,
      studentsList
    };

    await window.firebaseService.update(repId, updates);

    // تحديث الذاكرة
    const index = allRepresentatives.findIndex((r) => r.id === repId);
    if (index !== -1) {
      allRepresentatives[index] = { ...allRepresentatives[index], ...updates };
    }

    closeAdminEditModal();
    updateAdminStats();
    renderAdminTable();
    showToast("تم الحفظ بنجاح 💾", `تم تحديث بيانات مسؤول ${fullName} بنجاح`, "success");
  } catch (err) {
    console.error("Admin edit error:", err);
    showToast("خطأ", "حدث خطأ أثناء حفظ التعديلات", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i><span>حفظ التعديلات في السحابة</span>`;
  }
}

// حذف مسؤول من الإدارة
async function adminDeleteRepresentative(id) {
  const rep = allRepresentatives.find((r) => r.id === id);
  const name = rep ? rep.fullName : "المسؤول";

  if (confirm(`هل أنت متأكد تماماً من رغبتك في حذف بيانات مسؤول (${name}) من النظام نهائياً؟`)) {
    await window.firebaseService.delete(id);
    allRepresentatives = allRepresentatives.filter((r) => r.id !== id);
    updateAdminStats();
    renderAdminTable();
    showToast("تم الحذف 🗑️", `تم حذف سجل ${name} نهائياً`, "info");
  }
}

// تفريغ أسماء الطلاب لمسؤول معين من الإدارة
async function adminClearStudents(id) {
  const rep = allRepresentatives.find((r) => r.id === id);
  if (!rep) return;

  if (confirm(`هل تريد تفريغ قائمة أسماء الطلاب الخاصة بجامعة (${rep.university})؟`)) {
    await window.firebaseService.update(id, { studentsList: "" });
    rep.studentsList = "";
    updateAdminStats();
    renderAdminTable();
    showToast("تم التفريغ 🧹", `تم تفريغ أسماء الطلاب الخاصة بجامعة ${rep.university}`, "success");
  }
}

// فتح نافذة إضافة مسؤول جديد من الإدارة
function openAdminAddModal() {
  const modal = document.getElementById("adminAddModal");
  const form = document.getElementById("adminAddForm");
  if (!modal) return;

  if (form) form.reset();
  modal.classList.remove("hidden");
}

// إغلاق نافذة إضافة مسؤول
function closeAdminAddModal() {
  const modal = document.getElementById("adminAddModal");
  if (modal) modal.classList.add("hidden");
}

// حفظ المسؤول الجديد المضاف من الإدارة
async function handleAdminAddSubmit(e) {
  e.preventDefault();
  const fullNameInput = document.getElementById("adminNewFullName");
  const phoneInput = document.getElementById("adminNewPhone");
  const uniInput = document.getElementById("adminNewUniversity");
  const saveBtn = document.getElementById("saveNewAdminBtn");

  const fullName = fullNameInput.value.trim();
  const rawPhone = phoneInput.value.trim();
  const university = uniInput.value.trim();

  if (!validateFullName(fullName)) {
    showToast("تنبيه", "يرجى إدخال اسم ثلاثي صحيح (3 مقاطع على الأقل)", "error");
    return;
  }

  const cleanedPhone = cleanPhoneNumber(rawPhone);
  if (!/^01[0125][0-9]{8}$/.test(cleanedPhone)) {
    showToast("تنبيه", "يرجى إدخال رقم موبايل مصري صحيح مكون من 11 رقماً", "error");
    return;
  }

  if (!university) {
    showToast("تنبيه", "يرجى كتابة أو اختيار اسم الجامعة", "error");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>جاري الإضافة...</span>`;

  try {
    const newRep = {
      fullName,
      phone: cleanedPhone,
      whatsappPhone: getWhatsAppPhoneNumber(cleanedPhone),
      university,
      studentsList: ""
    };

    await window.firebaseService.add(newRep);

    closeAdminAddModal();
    updateAdminStats();
    renderAdminTable();
    showToast("تمت الإضافة بنجاح 🎉", `تم تسجيل ${fullName} بنجاح في المنظومة`, "success");
  } catch (err) {
    console.error("Admin add error:", err);
    showToast("خطأ", "حدث خطأ أثناء إضافة المسؤول", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fa-solid fa-check"></i><span>إضافة وحفظ المسؤول</span>`;
  }
}

// تصدير كافة البيانات إلى ملف Excel (CSV مع UTF-8 BOM لضمان اللغة العربية)
function exportAdminDataToExcel() {
  if (!allRepresentatives || allRepresentatives.length === 0) {
    showToast("تنبيه", "لا توجد بيانات متاحة للتصدير حالياً", "info");
    return;
  }

  // ترويسة ملف الإكسيل
  const headers = ["م", "اسم الجامعة", "اسم المسؤول", "رقم الموبايل", "عدد الطلاب", "أسماء الطلاب المراد سحبهم"];
  
  // تجهيز الصفوف
  const rows = allRepresentatives.map((rep, index) => {
    const studentCount = countStudentsInText(rep.studentsList || "");
    const cleanStudents = (rep.studentsList || "").replace(/"/g, '""');

    return [
      index + 1,
      `"${(rep.university || "").replace(/"/g, '""')}"`,
      `"${(rep.fullName || "").replace(/"/g, '""')}"`,
      `"${(rep.phone || "").replace(/"/g, '""')}"`,
      studentCount,
      `"${cleanStudents}"`
    ].join(",");
  });

  // إضافة UTF-8 BOM لفتح العربي بدون تشفير تالف في الإكسيل
  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");

  // إنشاء رابط التحميل
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  
  const today = new Date().toISOString().slice(0, 10);
  downloadLink.href = url;
  downloadLink.setAttribute("download", `تقرير_شئون_الطلاب_الجامعات_الخاصة_والأهلية_${today}.csv`);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  showToast("تم التصدير بنجاح 📊", "تم تنزيل ملف Excel المتوافق مع اللغة العربية", "success");
}
