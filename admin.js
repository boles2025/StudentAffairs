/**
 * لوحة الإدارة المركزية والتحكم العام
 * منظومة شئون طلاب الجامعات الخاصة والأهلية بجمهورية مصر العربية
 * إشراف وتصميم: مهندس بولس سمير — مدير شئون طلاب جامعة اللوتس بالمنيا
 */

(function () {
  'use strict';

  // الرمز الإداري السري
  const ADMIN_PIN = "8520";
  const ADMIN_SESSION_KEY = "lotus_admin_authenticated";

  // الحالة العامة للإدارة
  let allRequests = [];
  let allUsers = [];
  let allReps = [];
  let expandedRequestIds = new Set();
  let currentAdminTab = "requests"; // 'requests' | 'employees' | 'create' | 'universities'

  // حالة قائمة الجامعات المركزية
  let allUniversities = null;      // القائمة المحفوظة من لوحة الإدارة (null = لم تُحفظ قائمة بعد)
  let universitiesHasManagedData = false;
  let uniFilteredCache = [];       // نسخة نتائج البحث الحالية لشاشة إدارة الجامعات

  // ==========================================
  // 1. نظام التحقق والحماية (PIN Authentication)
  // ==========================================

  function checkAdminAuth() {
    const isAuth = sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
    const overlay = document.getElementById("adminPinOverlay");
    const content = document.getElementById("adminMainContent");

    if (isAuth) {
      if (overlay) overlay.classList.add("hidden");
      if (content) content.classList.remove("hidden");
      initAdminDashboard();
    } else {
      if (overlay) overlay.classList.remove("hidden");
      if (content) content.classList.add("hidden");
      const pinInput = document.getElementById("adminPinInput");
      if (pinInput) {
        pinInput.value = "";
        pinInput.focus();
      }
    }
  }

  window.handleAdminPinSubmit = function (event) {
    if (event) event.preventDefault();
    const pinInput = document.getElementById("adminPinInput");
    const errorMsg = document.getElementById("pinErrorMsg");
    const enteredPin = (pinInput ? pinInput.value : "").trim();

    if (enteredPin === ADMIN_PIN) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
      if (errorMsg) errorMsg.classList.add("hidden");
      checkAdminAuth();
    } else {
      if (errorMsg) errorMsg.classList.remove("hidden");
      if (pinInput) {
        pinInput.value = "";
        pinInput.focus();
      }
    }
  };

  window.handleAdminLogout = function () {
    if (confirm("هل تريد قفل لوحة الإدارة المركزية والعودة لشاشة الرمز السري؟")) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      checkAdminAuth();
    }
  };

  // ==========================================
  // 2. تهيئة المنظومة وتحميل البيانات الفورية
  // ==========================================

  function initAdminDashboard() {
    initDatalists();

    // الاشتراك الفوري في طلبات السحب
    if (window.firebaseService && typeof window.firebaseService.subscribeRequests === 'function') {
      window.firebaseService.subscribeRequests((requests) => {
        allRequests = requests || [];
        updateKpis();
        filterAdminRequests();
      });
    }

    // الاشتراك الفوري في المستخدمين
    if (window.firebaseService && typeof window.firebaseService.subscribeUsers === 'function') {
      window.firebaseService.subscribeUsers((users) => {
        allUsers = users || [];
        updateKpis();
        filterAdminEmployees();
        populateUniversityFilters();
      });
    }

    // الاشتراك في الممثلين لدعم جهات الاتصال
    if (window.firebaseService && typeof window.firebaseService.subscribeRepresentatives === 'function') {
      window.firebaseService.subscribeRepresentatives((reps) => {
        allReps = reps || [];
      });
    }

    // الاشتراك الفوري في قائمة الجامعات المركزية (تحكم الإدارة)
    if (window.firebaseService && typeof window.firebaseService.subscribeUniversities === 'function') {
      window.firebaseService.subscribeUniversities((uniList, hasData) => {
        universitiesHasManagedData = !!hasData;
        if (hasData && Array.isArray(uniList)) {
          allUniversities = uniList;
        } else {
          // لا بيانات إدارية محفوظة بعد → الاعتماد على القائمة الاعتيادية
          allUniversities = null;
        }
        refreshUniversityRelatedUI();
      });
    } else {
      refreshUniversityRelatedUI();
    }
  }

  // تحديث كل ما يتأثر بقائمة الجامعات (القوائم المنسدلة + التصفية + شاشة الإدارة)
  function refreshUniversityRelatedUI() {
    initDatalists();
    populateUniversityFilters();
    if (currentAdminTab === "universities" || document.getElementById("uniListContainer")) {
      renderUniList();
    }
  }

  window.loadAdminData = function () {
    const list = document.getElementById("adminRequestsList");
    if (list) {
      list.innerHTML = `
        <div class="glass-card p-12 text-center text-slate-400">
          <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-amber-400"></i>
          <p class="font-bold">جاري تحديث بيانات المنظومة بالكامل من السحابة...</p>
        </div>
      `;
    }
    // من التخزين والفايربيس
    if (window.firebaseService) {
      allRequests = window.firebaseService.getLocal('requests') || [];
      allUsers = window.firebaseService.getLocal('users') || [];
      allReps = window.firebaseService.getLocal('reps') || [];
      updateKpis();
      filterAdminRequests();
      filterAdminEmployees();
      refreshUniversityRelatedUI();
    }
  };

  // ==========================================
  // 1.5 القائمة الفعالة للجامعات (محكومة من لوحة الإدارة)
  // ==========================================

  // ترجع القائمة الإدارية المحفوظة إن وُجدت وإلا القائمة الاعتيادية الثابتة
  function getManageableUniversities() {
    if (Array.isArray(allUniversities)) {
      return allUniversities.slice();
    }
    if (typeof getActiveUniversities === "function") {
      const active = getActiveUniversities();
      if (Array.isArray(active) && active.length > 0) {
        return active.slice();
      }
      return active;
    }
    if (typeof EGYPTIAN_UNIVERSITIES !== 'undefined' && Array.isArray(EGYPTIAN_UNIVERSITIES)) {
      return EGYPTIAN_UNIVERSITIES.slice();
    }
    return [];
  }

  // توحيد نص اسم الجامعة لمقارنة أسماء متشابهة ومنع التكرار
  function normalizeUniText(str) {
    return String(str || "")
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u0652]/g, "") // إزالة التشكيل
      .replace(/[أإآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, " ");
  }

  // ==========================================
  // الرقم القومي: تحويل الأرقام واستخراجه من سطر الاسم
  // ==========================================

  function convertArabicDigitsToEnglish(str) {
    return String(str || "").replace(/[٠-٩]/g, (w) => "٠١٢٣٤٥٦٧٨٩".indexOf(w));
  }

  function extractNationalIdFromLine(line) {
    const englishDigits = convertArabicDigitsToEnglish(String(line || ""));

    // اختيار أفضل مرشّح: الأقرب للطول الرسمي 14 خانة (النطاق المقبول 12-15)
    const pickBest = (candidates) => {
      let best = "";
      (candidates || []).forEach((r) => {
        if (!best || Math.abs(r.length - 14) < Math.abs(best.length - 14)) best = r;
      });
      return best;
    };

    // 1) عدد متصل في السطر
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

  // يقبل الصيغ تلقائياً (بدون فصل يدوي):
  //   لصق إكسيل عمودين: "اسم الطالب<TAB>31234567890123" أو "31234567890123<TAB>اسم الطالب"
  //   "اسم الطالب 31234567890123"
  //   "اسم الطالب | 31234567890123"
  function parseStudentEntryWithNationalId(rawLine) {
    let line = String(rawLine || "").trim();
    if (!line) return { name: "", nationalId: "" };

    let nationalId = "";

    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      const withDigits = parts.filter((p) => /\d/.test(convertArabicDigitsToEnglish(p)));
      const nameParts = parts.filter((p) => !/\d/.test(convertArabicDigitsToEnglish(p)));
      if (withDigits.length > 0) {
        nationalId = extractNationalIdFromLine(withDigits[0]);
      }
      line = nameParts.length > 0 ? nameParts.join(" ") : line.replace(/\|/g, " ");
    }

    if (!nationalId) {
      nationalId = extractNationalIdFromLine(line);
    }

    if (nationalId) {
      // إزالة الرقم القومي من نص الاسم مع تسامح الفواصل/المسافات بين مجموعات الرقم
      const englishedLine = convertArabicDigitsToEnglish(line);
      const nidFuzzy = new RegExp(nationalId.split("").map((d) => `[${d}]`).join("[\\s\\-\\./]?"), "g");
      let cleaned = englishedLine.replace(nidFuzzy, " ");
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

  // تهيئة قوائم الجامعات المنسدلة
  function initDatalists() {
    const datalists = [
      document.getElementById("adminSenderUnisList"),
      document.getElementById("adminTargetUnisList"),
      document.getElementById("allUnisDataList")
    ];

    if (typeof EGYPTIAN_UNIVERSITIES !== 'undefined' && Array.isArray(EGYPTIAN_UNIVERSITIES)) {
      const activeUnis = getManageableUniversities();
      const optionsHtml = activeUnis.map(uni => `<option value="${escapeHtml(uni)}">`).join("");
      datalists.forEach(dl => {
        if (dl) dl.innerHTML = optionsHtml;
      });
    }
  }

  function populateUniversityFilters() {
    const filterSelect = document.getElementById("adminUniversityFilter");
    if (!filterSelect) return;

    const currentVal = filterSelect.value;
    const unisSet = new Set();

    getManageableUniversities().forEach(u => unisSet.add(u.trim()));
    allRequests.forEach(r => {
      if (r.senderUniversity) unisSet.add(r.senderUniversity.trim());
      if (r.targetUniversity) unisSet.add(r.targetUniversity.trim());
    });
    allUsers.forEach(u => {
      if (u.university) unisSet.add(u.university.trim());
    });

    const sortedUnis = Array.from(unisSet).filter(Boolean).sort();
    let html = `<option value="all">كافة الجامعات (${sortedUnis.length})</option>`;
    sortedUnis.forEach(u => {
      html += `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`;
    });

    filterSelect.innerHTML = html;
    if (currentVal && unisSet.has(currentVal)) {
      filterSelect.value = currentVal;
    }
  }

  // تحديث المؤشرات المركزية (KPIs)
  function updateKpis() {
    let totalReqs = allRequests.length;
    let totalStudents = 0;
    let completedStudents = 0;
    const activeUnis = new Set();

    allRequests.forEach(req => {
      if (req.senderUniversity) activeUnis.add(req.senderUniversity.trim());
      if (req.targetUniversity) activeUnis.add(req.targetUniversity.trim());

      const students = req.students || [];
      totalStudents += students.length;
      completedStudents += students.filter(s => s.isCompleted).length;
    });

    allUsers.forEach(u => {
      if (u.university) activeUnis.add(u.university.trim());
    });

    const pendingStudents = Math.max(0, totalStudents - completedStudents);
    const completionRate = totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0;

    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setTxt("kpiTotalRequests", totalReqs);
    setTxt("kpiTotalStudents", totalStudents);
    setTxt("kpiCompletedStudents", completedStudents);
    setTxt("kpiCompletedRate", `نسبة الإنجاز ${completionRate}%`);
    setTxt("kpiPendingStudents", pendingStudents);
    setTxt("kpiTotalEmployees", allUsers.length);
    setTxt("kpiActiveUnis", `${activeUnis.size} جامعة نشطة`);

    setTxt("requestsCountBadge", totalReqs);
    setTxt("employeesCountBadge", allUsers.length);
  }

  // ==========================================
  // 3. التبديل بين تبويبات الإدارة
  // ==========================================

  window.switchAdminTab = function (tabName) {
    currentAdminTab = tabName;

    const tabRequestsBtn = document.getElementById("adminTabRequestsBtn");
    const tabEmployeesBtn = document.getElementById("adminTabEmployeesBtn");
    const tabCreateBtn = document.getElementById("adminTabCreateBtn");
    const tabUniversitiesBtn = document.getElementById("adminTabUniversitiesBtn");

    const viewRequests = document.getElementById("adminTabRequestsView");
    const viewEmployees = document.getElementById("adminTabEmployeesView");
    const viewCreate = document.getElementById("adminTabCreateView");
    const viewUniversities = document.getElementById("adminTabUniversitiesView");

    [tabRequestsBtn, tabEmployeesBtn, tabCreateBtn, tabUniversitiesBtn].forEach(b => {
      if (b) {
        b.classList.remove("active", "text-amber-400");
        b.classList.add("text-slate-400");
      }
    });

    [viewRequests, viewEmployees, viewCreate, viewUniversities].forEach(v => {
      if (v) v.classList.add("hidden");
    });

    if (tabName === "requests") {
      if (tabRequestsBtn) tabRequestsBtn.classList.add("active");
      if (viewRequests) viewRequests.classList.remove("hidden");
      filterAdminRequests();
    } else if (tabName === "employees") {
      if (tabEmployeesBtn) tabEmployeesBtn.classList.add("active");
      if (viewEmployees) viewEmployees.classList.remove("hidden");
      filterAdminEmployees();
    } else if (tabName === "create") {
      if (tabCreateBtn) tabCreateBtn.classList.add("active");
      if (viewCreate) viewCreate.classList.remove("hidden");
    } else if (tabName === "universities") {
      if (tabUniversitiesBtn) tabUniversitiesBtn.classList.add("active");
      if (viewUniversities) viewUniversities.classList.remove("hidden");
      renderUniList();
      const uniNameInput = document.getElementById("uniNameInput");
      if (uniNameInput) uniNameInput.focus();
    }
  };

  // ==========================================
  // 4. إدارة كشوف السحب والطلاب (Requests Management)
  // ==========================================

  window.filterAdminRequests = function () {
    const searchInput = document.getElementById("adminSearchInput");
    const statusFilter = document.getElementById("adminStatusFilter");
    const uniFilter = document.getElementById("adminUniversityFilter");

    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const statusVal = statusFilter ? statusFilter.value : "all";
    const uniVal = uniFilter ? uniFilter.value : "all";

    const filtered = allRequests.filter(req => {
      // تصفية الحالة
      if (statusVal !== "all" && req.status !== statusVal) {
        return false;
      }

      // تصفية الجامعة
      if (uniVal !== "all") {
        const uniNorm = uniVal.toLowerCase();
        const sUni = (req.senderUniversity || "").toLowerCase();
        const tUni = (req.targetUniversity || "").toLowerCase();
        if (sUni !== uniNorm && tUni !== uniNorm) {
          return false;
        }
      }

      // تصفية البحث
      if (query) {
        const sUni = (req.senderUniversity || "").toLowerCase();
        const tUni = (req.targetUniversity || "").toLowerCase();
        const sName = (req.senderName || "").toLowerCase();
        const rTitle = (req.title || "").toLowerCase();
        const rId = (req.id || "").toLowerCase();

        const matchReq = sUni.includes(query) || tUni.includes(query) || sName.includes(query) || rTitle.includes(query) || rId.includes(query);
        if (matchReq) return true;

        // بحث في أسماء وملاحظات الطلاب
        const students = req.students || [];
        const matchStudent = students.some(st => 
          (st.name || "").toLowerCase().includes(query) || (st.notes || "").toLowerCase().includes(query)
        );
        if (!matchStudent) return false;
      }

      return true;
    });

    renderAdminRequests(filtered);
  };

  function renderAdminRequests(requests) {
    const container = document.getElementById("adminRequestsList");
    if (!container) return;

    if (!requests || requests.length === 0) {
      container.innerHTML = `
        <div class="glass-card p-12 text-center text-slate-400">
          <i class="fa-solid fa-folder-open text-3xl mb-3 text-slate-500"></i>
          <p class="font-bold text-sm">لا توجد كشوفات سحب مطابقة للبحث الحالي</p>
          <p class="text-xs text-slate-500 mt-1">جرّب تغيير خيارات البحث أو التصفية أعلاه</p>
        </div>
      `;
      return;
    }

    let html = "";
    requests.forEach((req, idx) => {
      const isExpanded = expandedRequestIds.has(req.id);
      const students = req.students || [];
      const totalStudents = students.length;
      const completedCount = students.filter(s => s.isCompleted).length;
      const progressPercent = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;

      let statusBadge = "";
      if (req.status === "completed" || (completedCount === totalStudents && totalStudents > 0)) {
        statusBadge = `<span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">تم السحب بالكامل ✅</span>`;
      } else if (req.status === "partial" || completedCount > 0) {
        statusBadge = `<span class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold">سحب جزئي (${completedCount}/${totalStudents}) ⏳</span>`;
      } else {
        statusBadge = `<span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold">قيد الانتظار ⭕</span>`;
      }

      const formattedDate = req.createdAt ? new Date(req.createdAt).toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : "غير محدد";

      html += `
        <div class="glass-card overflow-hidden border border-white/10 transition-all mb-4" id="adminReqCard_${req.id}">
          
          <!-- رأس الكشف -->
          <div class="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 border-b border-white/5">
            
            <div class="space-y-1.5 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5">#${req.id.substring(0, 12)}</span>
                ${statusBadge}
                <span class="text-xs text-slate-400 flex items-center gap-1">
                  <i class="fa-regular fa-clock"></i>
                  <span>${formattedDate}</span>
                </span>
              </div>

              <!-- مسار السحب: من جامعة كذا إلى جامعة كذا -->
              <div class="flex flex-wrap items-center gap-2 text-sm sm:text-base font-black text-white pt-1">
                <span class="text-amber-300">${escapeHtml(req.senderUniversity || "جامعة غير محددة")}</span>
                <i class="fa-solid fa-arrow-left text-slate-400 text-xs px-1"></i>
                <span class="text-emerald-400">${escapeHtml(req.targetUniversity || "جامعة غير محددة")}</span>
              </div>

              <!-- بيانات الموظف المرسل -->
              <div class="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-0.5">
                <span>المرسل: <strong class="text-slate-200">${escapeHtml(req.senderName || "مسؤول شئون طلاب")}</strong></span>
                ${req.senderPhone ? `
                  <a href="tel:${req.senderPhone}" class="text-sky-400 hover:underline flex items-center gap-1">
                    <i class="fa-solid fa-phone text-[10px]"></i> ${req.senderPhone}
                  </a>
                ` : ''}
                ${req.senderWhatsApp ? `
                  <a href="https://wa.me/${cleanPhoneForWa(req.senderWhatsApp)}" target="_blank" class="text-emerald-400 hover:underline flex items-center gap-1">
                    <i class="fa-brands fa-whatsapp text-[11px]"></i> واتساب
                  </a>
                ` : ''}
              </div>
            </div>

            <!-- شريط الإنجاز وأزرار الإجراءات -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              
              <!-- مؤشر النسبة المئوية -->
              <div class="bg-slate-800/80 px-3 py-2 rounded-xl border border-white/10 text-center min-w-[120px]">
                <div class="text-[11px] text-slate-400 font-bold mb-0.5">إنجاز سحب الملفات</div>
                <div class="flex items-center justify-center gap-1.5 font-bold text-xs text-amber-300">
                  <span>${completedCount}</span>
                  <span class="text-slate-500">/</span>
                  <span>${totalStudents} طلاب</span>
                  <span class="text-[10px] text-slate-400 font-mono">(${progressPercent}%)</span>
                </div>
              </div>

              <!-- أزرار الإجراءات -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <!-- زر الطباعة الرسمية -->
                <button 
                  onclick="openAdminPrintModal('${req.id}')" 
                  class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-white/10 text-xs font-bold transition-colors cursor-pointer"
                  title="طباعة الكشف الرسمي بدون توقيعات"
                >
                  <i class="fa-solid fa-print"></i>
                </button>

                <!-- زر تصدير Excel للكشف -->
                <button 
                  onclick="exportSingleRequestToExcel('${req.id}')" 
                  class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-white/10 text-xs font-bold transition-colors cursor-pointer"
                  title="تصدير هذا الكشف Excel"
                >
                  <i class="fa-solid fa-file-excel"></i>
                </button>

                <!-- زر إضافة طالب -->
                <button 
                  onclick="openAddStudentModal('${req.id}')" 
                  class="p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                  title="إضافة طالب جديد لهذا الكشف"
                >
                  <i class="fa-solid fa-user-plus"></i>
                  <span class="text-[11px] hidden lg:inline">طالب</span>
                </button>

                <!-- زر حذف الكشف بالكامل -->
                <button 
                  onclick="handleAdminDeleteRequest('${req.id}')" 
                  class="btn-danger p-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="حذف هذا الكشف بالكامل"
                >
                  <i class="fa-solid fa-trash-can"></i>
                </button>

                <!-- زر التوسيع والتقليص (+) -->
                <button 
                  onclick="toggleAdminRequestExpand('${req.id}')" 
                  class="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5"
                  title="${isExpanded ? 'تقليص الكشف' : 'توسيع الكشف لعرض ومتابعة الطلاب'}"
                >
                  <i class="fa-solid ${isExpanded ? 'fa-minus' : 'fa-plus'}"></i>
                  <span>${isExpanded ? 'طي الكشف' : 'عرض الطلاب (' + totalStudents + ')'}</span>
                </button>
              </div>

            </div>

          </div>

          <!-- جدول الطلاب داخل الكشف (يظهر عند التوسيع) -->
          <div class="${isExpanded ? 'block' : 'hidden'} p-4 sm:p-5 bg-slate-950/40">
            
            <div class="overflow-x-auto">
              <table class="w-full text-right text-xs">
                <thead class="bg-slate-900/90 text-slate-300 font-bold border-b border-white/10">
                  <tr>
                    <th class="p-3 w-10 text-center">#</th>
                    <th class="p-3 min-w-[200px]">اسم الطالب ثلاثي / رباعي</th>
                    <th class="p-3 min-w-[160px] text-center">الرقم القومي</th>
                    <th class="p-3 min-w-[170px] text-center">حالة السحب الفعلي</th>
                    <th class="p-3 min-w-[220px]">الملاحظات المسجلة</th>
                    <th class="p-3 min-w-[180px]">تاريخ ومسؤول السحب</th>
                    <th class="p-3 text-center w-20">حذف</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  ${students.length === 0 ? `
                    <tr>
                      <td colspan="7" class="p-6 text-center text-slate-500">
                        لا يوجد طلاب مدرجون في هذا الكشف حالياً. يمكنك إضافة طالب بالضغط على زر "طالب +" بالأعلى.
                      </td>
                    </tr>
                  ` : students.map((st, sIdx) => {
                    const stDone = !!st.isCompleted;
                    const completedDate = st.completedAt ? new Date(st.completedAt).toLocaleString('ar-EG', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : "—";

                    return `
                      <tr class="hover:bg-slate-900/40 transition-colors">
                        
                        <!-- الترقيم -->
                        <td class="p-3 text-center font-mono text-slate-400 font-bold">${sIdx + 1}</td>
                        
                        <!-- اسم الطالب -->
                        <td class="p-3">
                          <div class="font-bold text-white text-sm ${stDone ? 'line-through text-slate-400' : ''}">
                            ${escapeHtml(st.name || "")}
                          </div>
                        </td>

                        <!-- الرقم القومي -->
                        <td class="p-3 text-center">
                          ${
                            st.nationalId && String(st.nationalId).trim()
                              ? `<span class="font-mono text-slate-200 font-bold text-xs" dir="ltr">${escapeHtml(st.nationalId)}</span>`
                              : `<span class="text-slate-600 text-xs italic">غير مسجل</span>`
                          }
                        </td>

                        <!-- تبديل حالة السحب (تم السحب / لم يتم) -->
                        <td class="p-3 text-center">
                          <button 
                            onclick="handleAdminToggleStudentStatus('${req.id}', '${st.id}', ${!stDone})" 
                            class="w-full py-1.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                              stDone 
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30' 
                                : 'bg-slate-800 text-slate-400 border border-white/10 hover:border-amber-500/40 hover:text-white'
                            }"
                            title="اضغط لتغيير حالة السحب فوراً"
                          >
                            <i class="fa-solid ${stDone ? 'fa-circle-check text-emerald-400' : 'fa-circle text-slate-500'}"></i>
                            <span>${stDone ? 'تم السحب بنجاح' : 'لم يسحب بعد'}</span>
                          </button>
                        </td>

                        <!-- حقل الملاحظات الفوري -->
                        <td class="p-3">
                          <input 
                            type="text" 
                            value="${escapeHtml(st.notes || "")}" 
                            onchange="handleAdminUpdateStudentNotes('${req.id}', '${st.id}', this.value)" 
                            placeholder="أدخل ملاحظات (مكتب التنسيق، سبب الرفض...)" 
                            class="glass-input w-full px-3 py-1.5 rounded-lg text-xs"
                          >
                        </td>

                        <!-- موثق السحب والتاريخ -->
                        <td class="p-3 text-slate-400 text-[11px]">
                          ${stDone ? `
                            <div class="font-medium text-emerald-400/90">${escapeHtml(st.completedByName || "مسؤول شئون الطلاب")}</div>
                            <div class="text-[10px] text-slate-500">${completedDate}</div>
                          ` : `<span class="text-slate-600">في انتظار المراجعة</span>`}
                        </td>

                        <!-- حذف الطالب من الكشف -->
                        <td class="p-3 text-center">
                          <button 
                            onclick="handleAdminDeleteStudent('${req.id}', '${st.id}', '${escapeHtml(st.name || "")}')" 
                            class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 transition-colors"
                            title="حذف هذا الطالب من الكشف"
                          >
                            <i class="fa-solid fa-user-xmark"></i>
                          </button>
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
    });

    container.innerHTML = html;
  }

  window.toggleAdminRequestExpand = function (requestId) {
    if (expandedRequestIds.has(requestId)) {
      expandedRequestIds.delete(requestId);
    } else {
      expandedRequestIds.add(requestId);
    }
    filterAdminRequests();
  };

  window.expandAllRequests = function (shouldExpand) {
    if (shouldExpand) {
      allRequests.forEach(r => expandedRequestIds.add(r.id));
    } else {
      expandedRequestIds.clear();
    }
    filterAdminRequests();
  };

  // تبديل حالة سحب طالب
  window.handleAdminToggleStudentStatus = async function (requestId, studentId, newStatus) {
    try {
      const adminEmployee = {
        id: "usr_admin",
        fullName: "مهندس بولس سمير (المدير العام)",
        university: "إدارة المنظومة المركزية"
      };

      await window.firebaseService.updateStudentInRequest(requestId, studentId, {
        isCompleted: newStatus
      }, adminEmployee);

      // تحديث فوري محلي
      const req = allRequests.find(r => r.id === requestId);
      if (req && req.students) {
        const st = req.students.find(s => s.id === studentId);
        if (st) {
          st.isCompleted = newStatus;
          st.completedAt = newStatus ? Date.now() : null;
          st.completedByName = newStatus ? adminEmployee.fullName : null;
        }
      }
      updateKpis();
      filterAdminRequests();
    } catch (err) {
      console.error("Error toggling student status:", err);
      alert("حدث خطأ أثناء تعديل حالة الطالب");
    }
  };

  // حفظ ملاحظات الطالب
  window.handleAdminUpdateStudentNotes = async function (requestId, studentId, newNotes) {
    try {
      const adminEmployee = {
        id: "usr_admin",
        fullName: "مهندس بولس سمير (المدير العام)",
        university: "إدارة المنظومة المركزية"
      };

      await window.firebaseService.updateStudentInRequest(requestId, studentId, {
        notes: newNotes.trim()
      }, adminEmployee);

      const req = allRequests.find(r => r.id === requestId);
      if (req && req.students) {
        const st = req.students.find(s => s.id === studentId);
        if (st) st.notes = newNotes.trim();
      }
    } catch (err) {
      console.error("Error updating notes:", err);
    }
  };

  // حذف طالب من كشف
  window.handleAdminDeleteStudent = async function (requestId, studentId, studentName) {
    if (!confirm(`هل أنت متأكد من حذف الطالب "${studentName}" من هذا الكشف نهائياً؟`)) {
      return;
    }

    try {
      await window.firebaseService.deleteStudentFromRequest(requestId, studentId);
      const req = allRequests.find(r => r.id === requestId);
      if (req && req.students) {
        req.students = req.students.filter(s => s.id !== studentId);
        req.totalStudents = req.students.length;
        req.completedStudents = req.students.filter(s => s.isCompleted).length;
      }
      updateKpis();
      filterAdminRequests();
    } catch (err) {
      console.error("Error deleting student:", err);
      alert("حدث خطأ أثناء حذف الطالب");
    }
  };

  // حذف كشف سحب بالكامل
  window.handleAdminDeleteRequest = async function (requestId) {
    const req = allRequests.find(r => r.id === requestId);
    const title = req ? `كشف السحب من (${req.senderUniversity}) إلى (${req.targetUniversity})` : "هذا الكشف";

    if (!confirm(`تحذير إداري: هل أنت متأكد من حذف ${title} بجميع طلابه نهائياً من قاعدة البيانات؟`)) {
      return;
    }

    try {
      await window.firebaseService.deleteWithdrawalRequest(requestId);
      allRequests = allRequests.filter(r => r.id !== requestId);
      expandedRequestIds.delete(requestId);
      updateKpis();
      filterAdminRequests();
    } catch (err) {
      console.error("Error deleting request:", err);
      alert("حدث خطأ أثناء حذف الكشف");
    }
  };

  // ==========================================
  // 5. إدارة حسابات الموظفين (Employees Management)
  // ==========================================

  window.filterAdminEmployees = function () {
    const searchInput = document.getElementById("adminEmployeeSearchInput");
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

    const filtered = allUsers.filter(u => {
      if (!query) return true;
      const name = (u.fullName || "").toLowerCase();
      const phone = (u.phone || "").toLowerCase();
      const uni = (u.university || "").toLowerCase();
      const job = (u.jobTitle || "").toLowerCase();
      return name.includes(query) || phone.includes(query) || uni.includes(query) || job.includes(query);
    });

    renderAdminEmployees(filtered);
  };

  function renderAdminEmployees(users) {
    const tbody = document.getElementById("adminEmployeesTableBody");
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="p-8 text-center text-slate-500">
            لا توجد حسابات موظفين مطابقة للبحث
          </td>
        </tr>
      `;
      return;
    }

    let html = "";
    users.forEach((user, idx) => {
      const isAdmin = user.role === "admin" || user.phone === "01093939137";
      const cleanPhone = (user.phone || "").replace(/\D/g, "");
      const cleanWa = cleanPhoneForWa(user.whatsappPhone || cleanPhone);

      html += `
        <tr class="hover:bg-slate-900/40 transition-colors">
          <td class="p-3 text-center font-mono text-slate-400 font-bold">${idx + 1}</td>
          
          <td class="p-3">
            <div class="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
              <span>${escapeHtml(user.fullName || "غير محدد")}</span>
              ${isAdmin ? '<span class="text-amber-400 text-[10px]" title="حساب مدير عام"><i class="fa-solid fa-crown"></i></span>' : ''}
            </div>
          </td>

          <td class="p-3">
            <span class="text-amber-300 font-medium">${escapeHtml(user.university || "—")}</span>
          </td>

          <td class="p-3 text-slate-300">
            ${escapeHtml(user.jobTitle || "مسؤول شئون طلاب")}
          </td>

          <td class="p-3">
            ${cleanPhone ? `
              <a href="tel:${cleanPhone}" class="text-sky-400 hover:underline font-mono text-xs flex items-center gap-1">
                <i class="fa-solid fa-phone text-[10px]"></i> ${cleanPhone}
              </a>
            ` : '—'}
          </td>

          <td class="p-3">
            ${cleanWa ? `
              <a href="https://wa.me/${cleanWa}" target="_blank" class="text-emerald-400 hover:underline font-mono text-xs flex items-center gap-1">
                <i class="fa-brands fa-whatsapp text-sm"></i> محادثة
              </a>
            ` : '—'}
          </td>

          <td class="p-3">
            ${isAdmin ? `
              <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">مدير عام</span>
            ` : `
              <span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-medium border border-white/5">موظف جامعة</span>
            `}
          </td>

          <td class="p-3 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button 
                onclick="openEditEmployeeModal('${user.id}')" 
                class="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 transition-colors"
                title="تعديل بيانات الحساب"
              >
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button 
                onclick="handleAdminDeleteEmployee('${user.id}', '${escapeHtml(user.fullName || "")}')" 
                class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                title="حذف حساب الموظف نهائياً"
              >
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  // إضافة موظف جديد
  window.openAddEmployeeModal = function () {
    const modal = document.getElementById("addEmployeeModal");
    if (modal) modal.classList.remove("hidden");
    const nameInput = document.getElementById("newEmpFullName");
    if (nameInput) {
      nameInput.value = "";
      nameInput.focus();
    }
  };

  window.closeAddEmployeeModal = function () {
    const modal = document.getElementById("addEmployeeModal");
    if (modal) modal.classList.add("hidden");
  };

  window.handleAddEmployeeSubmit = async function (event) {
    if (event) event.preventDefault();

    const fullName = document.getElementById("newEmpFullName").value.trim();
    const phone = document.getElementById("newEmpPhone").value.trim();
    const whatsapp = document.getElementById("newEmpWhatsApp").value.trim() || phone;
    const university = document.getElementById("newEmpUniversity").value.trim();
    const jobTitle = document.getElementById("newEmpJobTitle").value.trim() || "مسؤول شئون طلاب";
    const password = document.getElementById("newEmpPassword").value.trim() || "123456";

    if (!fullName || !phone || !university) {
      alert("يرجى ملء كافة الحقول الإلزامية");
      return;
    }

    try {
      await window.firebaseService.registerUser({
        fullName,
        phone,
        whatsappPhone: cleanPhoneForWa(whatsapp),
        university,
        jobTitle,
        password,
        role: "employee"
      });

      alert(`تم إضافة حساب الموظف "${fullName}" بنجاح!`);
      closeAddEmployeeModal();
    } catch (err) {
      console.error("Error adding employee:", err);
      alert("حدث خطأ أثناء إضافة الموظف");
    }
  };

  // تعديل موظف
  window.openEditEmployeeModal = function (userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById("editEmpId").value = user.id;
    document.getElementById("editEmpFullName").value = user.fullName || "";
    document.getElementById("editEmpPhone").value = user.phone || "";
    document.getElementById("editEmpWhatsApp").value = user.whatsappPhone || user.phone || "";
    document.getElementById("editEmpUniversity").value = user.university || "";
    document.getElementById("editEmpJobTitle").value = user.jobTitle || "مسؤول شئون طلاب";
    document.getElementById("editEmpPassword").value = user.password || "";

    const modal = document.getElementById("editEmployeeModal");
    if (modal) modal.classList.remove("hidden");
  };

  window.closeEditEmployeeModal = function () {
    const modal = document.getElementById("editEmployeeModal");
    if (modal) modal.classList.add("hidden");
  };

  window.handleEditEmployeeSubmit = async function (event) {
    if (event) event.preventDefault();

    const userId = document.getElementById("editEmpId").value;
    const fullName = document.getElementById("editEmpFullName").value.trim();
    const phone = document.getElementById("editEmpPhone").value.trim();
    const whatsapp = document.getElementById("editEmpWhatsApp").value.trim() || phone;
    const university = document.getElementById("editEmpUniversity").value.trim();
    const jobTitle = document.getElementById("editEmpJobTitle").value.trim();
    const password = document.getElementById("editEmpPassword").value.trim();

    if (!userId || !fullName || !university) {
      alert("يرجى ملء الحقول الإلزامية");
      return;
    }

    try {
      await window.firebaseService.updateUserProfile(userId, {
        fullName,
        phone,
        whatsappPhone: cleanPhoneForWa(whatsapp),
        university,
        jobTitle,
        password
      });

      alert("تم تحديث بيانات الموظف بنجاح");
      closeEditEmployeeModal();
    } catch (err) {
      console.error("Error updating employee:", err);
      alert("حدث خطأ أثناء تحديث بيانات الموظف");
    }
  };

  // حذف موظف
  window.handleAdminDeleteEmployee = async function (userId, userName) {
    if (!confirm(`هل أنت متأكد من حذف حساب الموظف "${userName}" نهائياً من المنظومة؟`)) {
      return;
    }

    try {
      await window.firebaseService.deleteUser(userId);
      allUsers = allUsers.filter(u => u.id !== userId);
      updateKpis();
      filterAdminEmployees();
    } catch (err) {
      console.error("Error deleting user:", err);
      alert("حدث خطأ أثناء حذف الحساب");
    }
  };

  // ==========================================
  // 6. إصدار كشف سحب إداري مباشر
  // ==========================================

  window.handleAdminTargetUniChange = function () {
    const targetInput = document.getElementById("adminTargetUniInput");
    const repBox = document.getElementById("adminTargetRepBox");
    const repNameEl = document.getElementById("adminTargetRepName");
    const repPhoneEl = document.getElementById("adminTargetRepPhone");
    const callLink = document.getElementById("adminTargetCallLink");
    const waLink = document.getElementById("adminTargetWaLink");

    if (!targetInput || !repBox) return;

    const chosenUni = targetInput.value.trim().toLowerCase();
    if (!chosenUni) {
      repBox.classList.add("hidden");
      return;
    }

    // البحث في الموظفين المسجلين أو الممثلين
    let found = allUsers.find(u => (u.university || "").trim().toLowerCase() === chosenUni);
    if (!found) {
      found = allReps.find(r => (r.university || "").trim().toLowerCase() === chosenUni);
    }

    if (found) {
      repBox.classList.remove("hidden");
      const name = found.fullName || "مسؤول شئون الطلاب";
      const phone = found.phone || "";
      const wa = cleanPhoneForWa(found.whatsappPhone || phone);

      if (repNameEl) repNameEl.textContent = name;
      if (repPhoneEl) repPhoneEl.textContent = phone ? `(${phone})` : "";
      if (callLink) callLink.href = phone ? `tel:${phone}` : "#";
      if (waLink) waLink.href = wa ? `https://wa.me/${wa}` : "#";
    } else {
      repBox.classList.remove("hidden");
      if (repNameEl) repNameEl.textContent = "لم يسجل بعد في المنظومة";
      if (repPhoneEl) repPhoneEl.textContent = "";
      if (callLink) callLink.href = "#";
      if (waLink) waLink.href = "#";
    }
  };

  window.handleAdminCreateRequestSubmit = async function (event) {
    if (event) event.preventDefault();

    const senderUni = document.getElementById("adminSenderUniInput").value.trim();
    const targetUni = document.getElementById("adminTargetUniInput").value.trim();
    const studentsRaw = document.getElementById("adminStudentsTextarea").value;

    if (!senderUni || !targetUni) {
      alert("يرجى تحديد الجامعة المرسلة والمستهدفة");
      return;
    }

    const studentsLines = studentsRaw.split("\n")
      .map(line => line.replace(/^[\(\[\{]?[0-9٠-٩]{1,3}[\)\]\}]?[\.\-\:\)\s]+/, "").trim())
      .filter(line => line.length > 0);

    const studentsEntries = studentsLines
      .map(parseStudentEntryWithNationalId)
      .filter((entry) => entry.name || entry.nationalId);

    if (studentsEntries.length === 0) {
      alert("يرجى كتابة اسم طالب واحد على الأقل");
      return;
    }

    try {
      await window.firebaseService.createWithdrawalRequest({
        senderId: "usr_admin",
        senderName: "مهندس بولس سمير (المدير العام)",
        senderUniversity: senderUni,
        senderPhone: "01093939137",
        senderWhatsApp: "201093939137",
        targetUniversity: targetUni,
        title: `كشف سحب طلاب من ${senderUni} إلى ${targetUni}`,
        notes: "",
        studentsList: studentsEntries
      });

      alert(`تم إصدار كشف السحب بنجاح متضمناً (${studentsEntries.length}) طلاب!`);
      document.getElementById("adminCreateRequestForm").reset();
      updateAdminStudentsPreview("");
      document.getElementById("adminTargetRepBox").classList.add("hidden");
      switchAdminTab("requests");
    } catch (err) {
      console.error("Error creating admin request:", err);
      alert("حدث خطأ أثناء إصدار الكشف");
    }
  };

  // ==========================================
  // 7. إضافة طالب لكشف موجود
  // ==========================================

  window.openAddStudentModal = function (requestId) {
    document.getElementById("addStudentRequestId").value = requestId;
    const modal = document.getElementById("addStudentModal");
    if (modal) modal.classList.remove("hidden");
    const input = document.getElementById("newStudentNameInput");
    if (input) {
      input.value = "";
      input.focus();
    }
  };

  window.closeAddStudentModal = function () {
    const modal = document.getElementById("addStudentModal");
    if (modal) modal.classList.add("hidden");
  };

  // ==========================================
  // معاينة حية تلقائية: بمجرد اللصق يفهم النظام وجود
  // الرقم القومي ويضعه في عمود مستقل قبل الإصدار
  // ==========================================

  window.updateAdminStudentsPreview = function (rawText) {
    const preview = document.getElementById("adminStudentsPreview");
    if (!preview) return;

    const entries = String(rawText || "").split("\n")
      .map(line => line.replace(/^[\(\[\{]?[0-9٠-٩]{1,3}[\)\]\}]?[\.\-\:\)\s]+/, "").trim())
      .filter(line => line.length > 0)
      .map(parseStudentEntryWithNationalId)
      .filter((entry) => entry.name || entry.nationalId);

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
  };

  window.handleAddStudentSubmit = async function (event) {
    if (event) event.preventDefault();

    const requestId = document.getElementById("addStudentRequestId").value;
    const rawInput = document.getElementById("newStudentNameInput").value.trim();

    if (!requestId || !rawInput) {
      alert("يرجى إدخال اسم الطالب");
      return;
    }

    // يقبل الصيغة: "اسم الطالب | 31234567890123" أو الاسم متبوعاً بالرقم مباشرة
    const entry = parseStudentEntryWithNationalId(rawInput);
    const studentName = entry.name || rawInput;

    if (!studentName) {
      alert("يرجى إدخال اسم الطالب");
      return;
    }

    try {
      await window.firebaseService.addStudentToRequest(requestId, { name: studentName, nationalId: entry.nationalId });
      closeAddStudentModal();
      expandedRequestIds.add(requestId);
      updateKpis();
      filterAdminRequests();
    } catch (err) {
      console.error("Error adding student to request:", err);
      alert("حدث خطأ أثناء إضافة الطالب");
    }
  };

  // ==========================================
  // 8. الطباعة الرسمية (بدون توقيعات بالأسفل)
  // ==========================================

  window.openAdminPrintModal = function (requestId) {
    const req = allRequests.find(r => r.id === requestId);
    if (!req) return;

    const modal = document.getElementById("adminPrintModal");
    const content = document.getElementById("adminPrintContent");
    if (!modal || !content) return;

    const students = req.students || [];
    const formattedDate = req.createdAt ? new Date(req.createdAt).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : new Date().toLocaleDateString('ar-EG');

    content.innerHTML = `
      <!-- الترويسة الرسمية -->
      <div class="border-b-2 border-slate-900 pb-4 mb-6">
        <div class="flex items-center justify-between text-right">
          <div>
            <h2 class="text-lg font-black text-slate-950">جمهورية مصر العربية</h2>
            <h3 class="text-sm font-bold text-slate-800">وزارة التعليم العالي والبحث العلمي</h3>
            <p class="text-xs font-semibold text-slate-700">شئون طلاب الجامعات الخاصة والأهلية</p>
          </div>
          <div class="w-16 h-16 rounded-2xl border-2 border-slate-900 flex items-center justify-center text-3xl font-black text-slate-900">
            🎓
          </div>
          <div class="text-left text-xs font-semibold text-slate-800">
            <div>التاريخ: ${formattedDate}</div>
            <div>كود الكشف: #${req.id.substring(0, 10)}</div>
          </div>
        </div>

        <div class="text-center mt-4">
          <h1 class="text-xl font-black text-slate-950 underline decoration-2 underline-offset-8">
            كشف سحب وتسليم ملفات الطلاب
          </h1>
          <p class="text-xs font-bold text-slate-700 mt-2">
            من: <span class="text-slate-950 font-black">${escapeHtml(req.senderUniversity || "")}</span>
            &nbsp;إلى:&nbsp;
            <span class="text-slate-950 font-black">${escapeHtml(req.targetUniversity || "")}</span>
          </p>
        </div>
      </div>

      <!-- جدول أسماء الطلاب -->
      <table class="w-full text-right border-collapse border border-slate-900 text-xs mb-6">
        <thead>
          <tr class="bg-slate-100 text-slate-950 font-black">
            <th class="border border-slate-900 p-2 text-center w-12">م</th>
            <th class="border border-slate-900 p-2">اسم الطالب رباعي</th>
            <th class="border border-slate-900 p-2 text-center w-32">الرقم القومي</th>
            <th class="border border-slate-900 p-2 text-center w-28">حالة السحب</th>
            <th class="border border-slate-900 p-2">الملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${students.length === 0 ? `
            <tr>
              <td colspan="5" class="border border-slate-900 p-4 text-center text-slate-500">لا يوجد طلاب مسجلون بالكشف</td>
            </tr>
          ` : students.map((st, idx) => `
            <tr>
              <td class="border border-slate-900 p-2 text-center font-bold font-mono">${idx + 1}</td>
              <td class="border border-slate-900 p-2 font-bold text-slate-950">${escapeHtml(st.name || "")}</td>
              <td class="border border-slate-900 p-2 text-center font-mono" dir="ltr">${escapeHtml(st.nationalId || "—")}</td>
              <td class="border border-slate-900 p-2 text-center font-bold">
                ${st.isCompleted ? 'تم السحب ✅' : 'لم يسحب ⭕'}
              </td>
              <td class="border border-slate-900 p-2 text-slate-800">${escapeHtml(st.notes || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <!-- ملاحظة إدارية بدلاً من أي توقيعات سفلية بناءً على الطلب -->
      <div class="pt-2 text-center text-[11px] text-slate-600 border-t border-slate-300">
        مستند إلكتروني صادر ومعتمد من منظومة شئون طلاب الجامعات المصرية — جامعة اللوتس بالمنيا
      </div>
    `;

    modal.classList.remove("hidden");
  };

  window.closeAdminPrintModal = function () {
    const modal = document.getElementById("adminPrintModal");
    if (modal) modal.classList.add("hidden");
  };

  // ==========================================
  // 9. تصدير ملفات Excel (CSV UTF-8 BOM)
  // ==========================================

  // تصدير كافة الكشوفات والطلاب
  window.exportAdminRequestsToExcel = function () {
    if (!allRequests || allRequests.length === 0) {
      alert("لا توجد كشوفات لتصديرها");
      return;
    }

    let csv = "\uFEFF"; // UTF-8 BOM لفتح الحروف العربية بشكل سليم في الإكسيل
    csv += "كود الكشف,الجامعة المرسلة,الجامعة المستهدفة,اسم الموظف المرسل,هاتف المرسل,تاريخ الكشف,اسم الطالب,الرقم القومي,حالة السحب,الملاحظات,تاريخ السحب,موثق السحب\n";

    allRequests.forEach(req => {
      const sUni = sanitizeCsv(req.senderUniversity);
      const tUni = sanitizeCsv(req.targetUniversity);
      const sName = sanitizeCsv(req.senderName);
      const sPhone = sanitizeCsv(req.senderPhone);
      const rDate = req.createdAt ? new Date(req.createdAt).toLocaleDateString('ar-EG') : "";
      const students = req.students || [];

      if (students.length === 0) {
        csv += `"${req.id}","${sUni}","${tUni}","${sName}","${sPhone}","${rDate}","لا يوجد طلاب","—","—","—","—","—"\n`;
      } else {
        students.forEach(st => {
          const stName = sanitizeCsv(st.name);
          const stNid = sanitizeCsv(st.nationalId || "");
          const stStatus = st.isCompleted ? "تم السحب" : "لم يسحب";
          const stNotes = sanitizeCsv(st.notes || "");
          const stDoneDate = st.completedAt ? new Date(st.completedAt).toLocaleDateString('ar-EG') : "";
          const stDoneBy = sanitizeCsv(st.completedByName || "");
          csv += `"${req.id}","${sUni}","${tUni}","${sName}","${sPhone}","${rDate}","${stName}","${stNid}","${stStatus}","${stNotes}","${stDoneDate}","${stDoneBy}"\n`;
        });
      }
    });

    downloadCsvFile(csv, `كشوفات_سحب_الطلاب_الشامل_${formatDateForFilename(new Date())}.csv`);
  };

  // تصدير كشف واحد
  window.exportSingleRequestToExcel = function (requestId) {
    const req = allRequests.find(r => r.id === requestId);
    if (!req) return;

    let csv = "\uFEFF";
    csv += "م,اسم الطالب,الرقم القومي,حالة السحب,الملاحظات,تاريخ السحب,موثق السحب\n";

    const students = req.students || [];
    students.forEach((st, idx) => {
      const stName = sanitizeCsv(st.name);
      const stNid = sanitizeCsv(st.nationalId || "");
      const stStatus = st.isCompleted ? "تم السحب" : "لم يسحب";
      const stNotes = sanitizeCsv(st.notes || "");
      const stDoneDate = st.completedAt ? new Date(st.completedAt).toLocaleDateString('ar-EG') : "";
      const stDoneBy = sanitizeCsv(st.completedByName || "");
      csv += `"${idx + 1}","${stName}","${stNid}","${stStatus}","${stNotes}","${stDoneDate}","${stDoneBy}"\n`;
    });

    downloadCsvFile(csv, `كشف_سحب_${sanitizeCsv(req.senderUniversity)}_الى_${sanitizeCsv(req.targetUniversity)}.csv`);
  };

  // تصدير الموظفين
  window.exportAdminEmployeesToExcel = function () {
    if (!allUsers || allUsers.length === 0) {
      alert("لا يوجد موظفون لتصديرهم");
      return;
    }

    let csv = "\uFEFF";
    csv += "م,اسم الموظف,الجامعة,المسمى الوظيفي,رقم الهاتف,رقم الواتساب,الصلاحية,تاريخ التسجيل\n";

    allUsers.forEach((u, idx) => {
      const name = sanitizeCsv(u.fullName);
      const uni = sanitizeCsv(u.university);
      const job = sanitizeCsv(u.jobTitle || "مسؤول شئون طلاب");
      const phone = sanitizeCsv(u.phone);
      const wa = sanitizeCsv(u.whatsappPhone || u.phone);
      const role = u.role === "admin" ? "مدير عام" : "موظف";
      const regDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('ar-EG') : "";
      csv += `"${idx + 1}","${name}","${uni}","${job}","${phone}","${wa}","${role}","${regDate}"\n`;
    });

    downloadCsvFile(csv, `سجل_موظفي_شئون_الطلاب_${formatDateForFilename(new Date())}.csv`);
  };

  // دوال مساعدة لـ CSV
  function sanitizeCsv(str) {
    if (!str) return "";
    return String(str).replace(/"/g, '""');
  }

  function downloadCsvFile(content, fileName) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function formatDateForFilename(d) {
    return `${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cleanPhoneForWa(phone) {
    if (!phone) return "";
    let clean = String(phone).replace(/\D/g, "");
    if (clean.startsWith("0")) {
      clean = "20" + clean.substring(1);
    } else if (!clean.startsWith("20") && clean.length === 10) {
      clean = "20" + clean;
    }
    return clean;
  }

  // ==========================================
  // 10. إدارة قائمة الجامعات (Universities Management)
  // إضافة / تعديل / حذف أسماء الجامعات المركزية
  // ==========================================

  // عرض قائمة الجامعات مع البحث الفوري
  window.renderUniList = function () {
    const container = document.getElementById("uniListContainer");
    const emptyState = document.getElementById("uniEmptyState");
    const countBadge = document.getElementById("uniCountBadge");
    if (!container) return;

    const searchInput = document.getElementById("uniSearchInput");
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

    const fullList = getManageableUniversities();
    const filtered = query
      ? fullList.filter(u => (u || "").toLowerCase().includes(query))
      : fullList.slice();

    uniFilteredCache = filtered;

    if (countBadge) {
      countBadge.textContent = `${fullList.length} جامعة`;
    }

    if (filtered.length === 0) {
      container.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    let html = "";
    filtered.forEach((uni, idx) => {
      html += `
        <div class="flex items-center justify-between gap-3 p-3 hover:bg-slate-900/40 transition-colors">

          <div class="flex items-center gap-3 min-w-0">
            <span class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 font-black text-xs flex items-center justify-center shrink-0">${idx + 1}</span>
            <span class="text-sm font-bold text-white truncate">${escapeHtml(uni)}</span>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              onclick="startUniEdit(${idx})"
              class="p-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 transition-colors"
              title="تعديل اسم هذه الجامعة"
            >
              <i class="fa-solid fa-pen-to-square"></i>
            </button>

            <button
              onclick="handleUniDelete(${idx})"
              class="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
              title="حذف هذه الجامعة من القائمة"
            >
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>

        </div>
      `;
    });

    container.innerHTML = html;
  };

  // رسائل حالة صغيرة أسفل نموذج الإضافة/التعديل
  function showUniMessage(message, type) {
    const box = document.getElementById("uniMessage");
    if (!box) {
      if (message) alert(message);
      return;
    }

    box.textContent = message;
    box.classList.remove("hidden", "bg-emerald-500/15", "text-emerald-300", "border", "border-emerald-500/30", "bg-rose-500/15", "text-rose-300", "border-rose-500/30");

    if (type === "success") {
      box.classList.add("bg-emerald-500/15", "text-emerald-300", "border", "border-emerald-500/30");
    } else {
      box.classList.add("bg-rose-500/15", "text-rose-300", "border", "border-rose-500/30");
    }

    clearTimeout(box._uniMsgTimer);
    box._uniMsgTimer = setTimeout(() => box.classList.add("hidden"), 4000);
  }

  // حفظ القائمة في السحابة + التخزين المحلي ثم تحديث كل الواجهات
  async function persistUniversities(list, successMessage) {
    try {
      if (window.firebaseService && typeof window.firebaseService.saveUniversitiesList === "function") {
        const saved = await window.firebaseService.saveUniversitiesList(list);
        allUniversities = saved;
        universitiesHasManagedData = true;
      } else {
        allUniversities = Array.from(new Set((list || []).map(u => (u || "").trim()).filter(Boolean)));
        try {
          localStorage.setItem("lotus_affairs_universities_data", JSON.stringify(allUniversities));
        } catch (e) {
          console.error("Failed to save universities locally:", e);
        }
        universitiesHasManagedData = true;
      }

      refreshUniversityRelatedUI();
      if (successMessage) showUniMessage(successMessage, "success");
    } catch (err) {
      console.error("Error saving universities list:", err);
      showUniMessage("حدث خطأ أثناء حفظ قائمة الجامعات، يرجى المحاولة مجدداً", "error");
    }
  }

  // إضافة أو تعديل (حسب وجود قيمة قيد التعديل)
  window.handleUniManagerSave = async function (event) {
    if (event) event.preventDefault();

    const nameInput = document.getElementById("uniNameInput");
    const editValueInput = document.getElementById("uniEditValue");

    const newName = (nameInput ? nameInput.value : "").trim();
    const editingOldValue = (editValueInput ? editValueInput.value : "").trim();

    if (!newName) {
      showUniMessage("يرجى كتابة اسم الجامعة", "error");
      return;
    }

    const fullList = getManageableUniversities();
    const normalizedNew = normalizeUniText(newName);

    if (editingOldValue) {
      // ==================== تعديل ====================
      const pos = fullList.indexOf(editingOldValue);
      if (pos === -1) {
        showUniMessage("اسم الجامعة الأصلي لم يُعد موجوداً في القائمة، ربما تم حذفه", "error");
        refreshUniversityRelatedUI();
        resetUniEditor();
        return;
      }

      const duplicatePos = fullList.findIndex(u => u !== editingOldValue && normalizeUniText(u) === normalizedNew);
      if (duplicatePos !== -1) {
        showUniMessage("اسم آخر مسجل بنفس الاسم — يرجى اختيار اسم مختلف", "error");
        return;
      }

      fullList[pos] = newName;
      await persistUniversities(fullList, `تم تعديل الجامعة من "${editingOldValue}" إلى "${newName}" بنجاح!`);
      resetUniEditor();
    } else {
      // ==================== إضافة ====================
      const duplicatePos = fullList.findIndex(u => normalizeUniText(u) === normalizedNew);
      if (duplicatePos !== -1) {
        showUniMessage("هذه الجامعة موجودة بالفعل في القائمة", "error");
        return;
      }

      fullList.push(newName);
      await persistUniversities(fullList, `تمت إضافة جامعة "${newName}" بنجاح!`);
      nameInput.value = "";
      nameInput.focus();
    }
  };

  // بدء تعديل اسم جامعة
  window.startUniEdit = function (filteredIdx) {
    const uniName = uniFilteredCache[filteredIdx];
    if (!uniName) return;

    const nameInput = document.getElementById("uniNameInput");
    const editValueInput = document.getElementById("uniEditValue");
    const saveLabel = document.getElementById("uniSaveBtnLabel");
    const cancelBtn = document.getElementById("uniCancelEditBtn");

    if (nameInput) nameInput.value = uniName;
    if (editValueInput) editValueInput.value = uniName;
    if (saveLabel) saveLabel.textContent = "تحديث الاسم";
    if (cancelBtn) cancelBtn.classList.remove("hidden");

    if (nameInput) {
      nameInput.focus();
      nameInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    showUniMessage(`وضع التعديل: "${uniName}" — عدّل الاسم ثم اضغط تحديث`, "success");
  };

  // إلغاء التعديل والعودة لوضع الإضافة
  window.cancelUniEdit = function () {
    resetUniEditor();
    showUniMessage("تم إلغاء التعديل", "success");
  };

  function resetUniEditor() {
    const nameInput = document.getElementById("uniNameInput");
    const editValueInput = document.getElementById("uniEditValue");
    const saveLabel = document.getElementById("uniSaveBtnLabel");
    const cancelBtn = document.getElementById("uniCancelEditBtn");

    if (nameInput) nameInput.value = "";
    if (editValueInput) editValueInput.value = "";
    if (saveLabel) saveLabel.textContent = "إضافة جامعة";
    if (cancelBtn) cancelBtn.classList.add("hidden");
  }

  // حذف جامعة من القائمة
  window.handleUniDelete = async function (filteredIdx) {
    const uniName = uniFilteredCache[filteredIdx];
    if (!uniName) return;

    if (!confirm(`هل أنت متأكد من حذف جامعة "${uniName}" من قائمة الجامعات المركزية؟\n\nملاحظة: الكشوفات وحسابات الموظفين السابقة المرتبطة بهذا الاسم لن تُحذف ولن تتأثر.`)) {
      return;
    }

    const fullList = getManageableUniversities();
    const pos = fullList.indexOf(uniName);
    if (pos === -1) {
      refreshUniversityRelatedUI();
      return;
    }

    // لو كان نفس الاسم قيد التعديل، نلغي وضع التعديل
    const editValueInput = document.getElementById("uniEditValue");
    if (editValueInput && editValueInput.value === uniName) {
      resetUniEditor();
    }

    fullList.splice(pos, 1);
    await persistUniversities(fullList, `تم حذف جامعة "${uniName}" بنجاح!`);
  };

  // إدراج القائمة الافتراضية المحدثة (خاصة + أهلية + الفروع) ضمن القائمة المحفوظة
  // يُدمج ذكياً: يضيف الجامعات غير الموجودة فقط بنفس منطق توحيد الأسماء
  window.importDefaultUniversities = async function () {
    let staticList = [];
    if (typeof window.getStaticDefaultUniversities === "function") {
      staticList = window.getStaticDefaultUniversities();
    } else if (typeof EGYPTIAN_UNIVERSITIES !== 'undefined' && Array.isArray(EGYPTIAN_UNIVERSITIES)) {
      staticList = EGYPTIAN_UNIVERSITIES.slice();
    }

    const managed = getManageableUniversities();
    const managedSet = new Set(managed.map(u => normalizeUniText(u)));
    const missing = staticList.filter(u => {
      return u && u.trim() && !managedSet.has(normalizeUniText(u));
    });

    if (missing.length === 0) {
      showUniMessage("قائمتك الحالية تحتوي بالفعل على كافة الجامعات الافتراضية ✅", "success");
      return;
    }

    if (!confirm(`سيتم إدراج (${missing.length}) جامعة جديدة من القائمة الافتراضية المحدثة.\n\nملاحظة: أي جامعة افتراضية سبق أن حذفتها من قائمتك ستعود مع هذه العملية.\n\nهل تريد المتابعة؟`)) {
      return;
    }

    const merged = managed.concat(missing);
    await persistUniversities(merged, `تم إدراج ${missing.length} جامعة جديدة من القائمة الافتراضية بنجاح! 🎉`);
  };

  // ==========================================
  // 11. التشغيل عند التحميل
  // ==========================================

  document.addEventListener("DOMContentLoaded", function () {
    checkAdminAuth();
  });

})();
