/**
 * Firebase Realtime Database Service
 * منظومة شئون طلاب الجامعات الخاصة والأهلية
 * إدارة الاتصال والمزامنة الفورية للسجلات، حسابات الموظفين، طلبات سحب ملفات الطلاب، والإشعارات الحية
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
    this.repsRef = null;
    this.usersRef = null;
    this.requestsRef = null;
    this.notificationsRef = null;
    this.universitiesRef = null;

    // مفاتيح التخزين المحلي الاحتياطي
    this.storageKeys = {
      reps: "lotus_representatives_data",
      users: "lotus_affairs_users_data",
      requests: "lotus_affairs_requests_data",
      notifications: "lotus_affairs_notifications_data",
      universities: "lotus_affairs_universities_data",
      session: "lotus_affairs_current_user"
    };

    this.init();
  }

  init() {
    try {
      if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        this.db = firebase.database();
        this.repsRef = this.db.ref('university_representatives');
        this.usersRef = this.db.ref('student_affairs_users');
        this.requestsRef = this.db.ref('student_affairs_requests');
        this.notificationsRef = this.db.ref('student_affairs_notifications');
        this.universitiesRef = this.db.ref('student_affairs_universities');
        this.isInitialized = true;
        console.log("Firebase Realtime Database initialized successfully with multi-node support.");
      } else {
        console.warn("Firebase SDK not loaded, working in local fallback mode.");
      }
    } catch (error) {
      console.error("Firebase initialization failed:", error);
    }
  }

  // ==========================================
  // دوال مساعدة للتخزين المحلي (LocalStorage Fallback)
  // ==========================================

  getLocal(key) {
    try {
      const data = localStorage.getItem(this.storageKeys[key] || key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveLocal(key, data) {
    try {
      localStorage.setItem(this.storageKeys[key] || key, JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to save ${key} to localStorage:`, e);
    }
  }

  // ==========================================
  // 1. دليل ممثلي الجامعات (Representatives)
  // ==========================================

  subscribeRepresentatives(callback) {
    if (this.isInitialized && this.repsRef) {
      this.repsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        let records = [];
        if (data) {
          records = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
        this.saveLocal('reps', records);
        callback(records, true);
      }, (error) => {
        console.warn("Firebase reps read error:", error);
        callback(this.getLocal('reps'), false);
      });
    } else {
      callback(this.getLocal('reps'), false);
    }
  }

  async addRepresentative(rep) {
    const newRecord = {
      ...rep,
      studentsList: rep.studentsList || "",
      createdAt: rep.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    let recordId = null;
    if (this.isInitialized && this.repsRef) {
      try {
        const newRef = this.repsRef.push();
        recordId = newRef.key;
        await newRef.set(newRecord);
      } catch (err) {
        console.warn("Firebase reps add error, using local fallback:", err);
      }
    }

    if (!recordId) {
      recordId = 'rep_' + Date.now();
    }

    const local = this.getLocal('reps');
    const saved = { id: recordId, ...newRecord };
    if (!local.some(item => item.id === recordId)) {
      local.unshift(saved);
      this.saveLocal('reps', local);
    }
    return { success: true, id: recordId, ...newRecord };
  }

  async updateRepresentative(id, updates) {
    const updatedData = { ...updates, updatedAt: Date.now() };

    const local = this.getLocal('reps');
    const index = local.findIndex(item => item.id === id);
    if (index !== -1) {
      local[index] = { ...local[index], ...updatedData };
      this.saveLocal('reps', local);
    }

    if (this.isInitialized && this.repsRef && !id.startsWith('local_') && !id.startsWith('rep_')) {
      try {
        await this.repsRef.child(id).update(updatedData);
      } catch (err) {
        console.warn("Firebase reps update error:", err);
      }
    }
    return { success: true };
  }

  async deleteRepresentative(id) {
    if (this.isInitialized && this.repsRef && !id.startsWith('local_') && !id.startsWith('rep_')) {
      try {
        await this.repsRef.child(id).remove();
      } catch (err) {
        console.error("Firebase reps delete error:", err);
      }
    }
    const local = this.getLocal('reps').filter(item => item.id !== id);
    this.saveLocal('reps', local);
    return { success: true };
  }

  // ==========================================
  // 2. إدارة حسابات الموظفين (Employee Accounts)
  // ==========================================

  subscribeUsers(callback) {
    if (this.isInitialized && this.usersRef) {
      this.usersRef.on('value', (snapshot) => {
        const data = snapshot.val();
        let users = [];
        if (data) {
          users = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
        }
        this.saveLocal('users', users);
        callback(users, true);
      }, (error) => {
        console.warn("Firebase users read error:", error);
        callback(this.getLocal('users'), false);
      });
    } else {
      callback(this.getLocal('users'), false);
    }
  }

  async registerUser(userData) {
    const cleanPhone = (userData.phone || "").replace(/\D/g, "");
    const uni = (userData.university || "").trim();
    const contactPerson = userData.contactPerson ? userData.contactPerson.trim() : (userData.fullName && userData.fullName.trim() !== uni ? userData.fullName.trim() : "");
    const officialName = uni || (userData.fullName ? userData.fullName.trim() : "جامعة غير محددة");
    const userId = cleanPhone ? ('usr_' + cleanPhone) : ('usr_uni_' + Date.now());

    const userRecord = {
      id: userId,
      fullName: officialName,
      university: uni || officialName,
      contactPerson: contactPerson,
      phone: cleanPhone,
      whatsappPhone: userData.whatsappPhone || ('20' + (cleanPhone.startsWith('0') ? cleanPhone.substring(1) : cleanPhone)),
      jobTitle: userData.jobTitle ? userData.jobTitle.trim() : "شئون الطلاب",
      password: userData.password,
      role: userData.role || (cleanPhone === "01093939137" ? "admin" : "employee"),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (this.isInitialized && this.usersRef) {
      try {
        await this.usersRef.child(userId).set(userRecord);
      } catch (e) {
        console.warn("Firebase register user error:", e);
      }
    }

    // حفظ محلي
    const localUsers = this.getLocal('users');
    const existingIndex = localUsers.findIndex(u => u.id === userId || (cleanPhone && u.phone === cleanPhone) || (uni && u.university === uni));
    if (existingIndex !== -1) {
      localUsers[existingIndex] = { ...localUsers[existingIndex], ...userRecord };
    } else {
      localUsers.unshift(userRecord);
    }
    this.saveLocal('users', localUsers);

    // إضافة الحساب أيضاً لدليل ممثلي الجامعات
    await this.addOrSyncRepresentativeFromUser(userRecord);

    return { success: true, user: userRecord };
  }

  async loginUser(identifier, password) {
    const raw = (identifier || "").trim();
    const cleanPhone = raw.replace(/\D/g, "");
    const rawNorm = raw.trim(); // نحتفظ بالاسم كما هو (عربي)
    const rawNormLower = raw.toLowerCase().trim(); // للمقارنة مع الإنجليزية
    let user = null;

    console.log("loginUser → identifier:", raw, "| cleanPhone:", cleanPhone);

    if (this.isInitialized && this.usersRef) {
      try {
        // 1) بحث مباشر بالرقم
        if (cleanPhone.length >= 10) {
          const snap = await this.usersRef.child('usr_' + cleanPhone).once('value');
          if (snap.exists()) {
            user = snap.val();
            console.log("Found by direct phone key");
          }
        }
        // 2) بحث في كل المستخدمين
        if (!user) {
          const snapAll = await this.usersRef.once('value');
          const allData = snapAll.val();
          console.log("All users in Firebase:", allData ? Object.keys(allData).length : 0);
          if (allData) {
            for (const key of Object.keys(allData)) {
              const u = allData[key];
              const uPhone = (u.phone || "").replace(/\D/g, "");
              const uUni = (u.university || "").trim();
              const uUniLower = uUni.toLowerCase();
              const phoneMatch = cleanPhone.length >= 10 && uPhone === cleanPhone;
              const uniMatch = rawNorm.length > 0 && (uUni === rawNorm || uUniLower === rawNormLower || uUni.includes(rawNorm) || rawNorm.includes(uUni));
              console.log(`  key=${key} | uUni="${uUni}" | rawNorm="${rawNorm}" | uniMatch=${uniMatch} | phoneMatch=${phoneMatch}`);
              if (phoneMatch || uniMatch) {
                user = u;
                break;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Firebase login fetch error:", e);
      }
    }

    // 3) بحث محلي
    if (!user) {
      const localUsers = this.getLocal('users');
      console.log("Local users count:", localUsers.length);
      user = localUsers.find(u => {
        const uPhone = (u.phone || "").replace(/\D/g, "");
        const uUni = (u.university || "").trim();
        const phoneMatch = cleanPhone.length >= 10 && uPhone === cleanPhone;
        const uniMatch = rawNorm.length > 0 && (uUni === rawNorm || uUni.toLowerCase() === rawNormLower || uUni.includes(rawNorm) || rawNorm.includes(uUni));
        return phoneMatch || uniMatch;
      });
    }

    // إذا لم يكن مسجلاً كمستخدم بعد ولكنه مسجل كممثل جامعة في الدليل
    if (!user) {
      const localReps = this.getLocal('reps');
      const rep = localReps.find(r => {
        const rPhone = (r.phone || "").replace(/\D/g, "");
        const rUni = (r.university || "").toLowerCase().trim();
        return (cleanPhone && rPhone === cleanPhone) || (rawNorm && rUni === rawNorm);
      });
      if (rep) {
        const uId = 'usr_' + (cleanPhone || ('rep_' + Date.now()));
        user = {
          id: uId,
          fullName: rep.university || rep.fullName,
          university: rep.university,
          contactPerson: rep.fullName,
          phone: cleanPhone || rep.phone,
          whatsappPhone: rep.whatsappPhone || ('20' + (cleanPhone.startsWith('0') ? cleanPhone.substring(1) : cleanPhone)),
          jobTitle: "شئون الطلاب",
          password: password || "",
          role: cleanPhone === "01093939137" ? "admin" : "employee",
          createdAt: rep.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        await this.registerUser(user);
      }
    }

    if (!user) {
      return { success: false, error: "اسم الجامعة أو رقم الموبايل غير مسجل، يرجى إنشاء حساب الجامعة أولاً" };
    }

    if (user.password && password && user.password !== password) {
      return { success: false, error: "كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى" };
    }

    this.setCurrentUser(user);
    return { success: true, user };
  }

  async addOrSyncRepresentativeFromUser(userRecord) {
    try {
      const localReps = this.getLocal('reps');
      const existing = localReps.find(r => r.phone === userRecord.phone);
      if (!existing) {
        await this.addRepresentative({
          fullName: userRecord.fullName,
          phone: userRecord.phone,
          whatsappPhone: userRecord.whatsappPhone,
          university: userRecord.university,
          studentsList: ""
        });
      }
    } catch (e) {
      console.warn("Syncing representative error:", e);
    }
  }

  async updateUserProfile(userId, updates) {
    const updated = { ...updates, updatedAt: Date.now() };

    if (this.isInitialized && this.usersRef) {
      try {
        await this.usersRef.child(userId).update(updated);
      } catch (e) {
        console.warn("Firebase user update error:", e);
      }
    }

    const localUsers = this.getLocal('users');
    const idx = localUsers.findIndex(u => u.id === userId);
    if (idx !== -1) {
      localUsers[idx] = { ...localUsers[idx], ...updated };
      this.saveLocal('users', localUsers);
    }

    return { success: true };
  }

  async deleteUser(userId) {
    if (this.isInitialized && this.usersRef) {
      try {
        await this.usersRef.child(userId).remove();
      } catch (e) {
        console.warn("Firebase delete user error:", e);
      }
    }
    const localUsers = this.getLocal('users').filter(u => u.id !== userId);
    this.saveLocal('users', localUsers);
    return { success: true };
  }

  // ==========================================
  // 3. طلبات سحب ملفات الطلاب (Withdrawal Requests)
  // ==========================================

  subscribeRequests(callback) {
    if (this.isInitialized && this.requestsRef) {
      this.requestsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        let requests = [];
        if (data) {
          requests = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
        this.saveLocal('requests', requests);
        callback(requests, true);
      }, (error) => {
        console.warn("Firebase requests read error:", error);
        callback(this.getLocal('requests'), false);
      });
    } else {
      callback(this.getLocal('requests'), false);
    }
  }

  async createWithdrawalRequest(requestData) {
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // تحويل أسماء الطلاب إلى مصفوفة كائنات طلابية
    const rawStudents = requestData.studentsList || [];
    const formattedStudents = rawStudents.map((st, idx) => {
      const baseStudent = {
        id: `st_${Date.now()}_${idx + 1}`,
        name: "",
        nationalId: "",
        isCompleted: false,
        notes: "",
        completedAt: null,
        completedByName: null,
        updatedAt: Date.now()
      };

      if (typeof st === 'string') {
        baseStudent.name = st.trim();
      } else {
        baseStudent.id = st.id || baseStudent.id;
        baseStudent.name = (st.name || "").toString().trim();
        baseStudent.nationalId = (st.nationalId || "").toString().trim();
      }

      return baseStudent;
    });

    const newRequest = {
      id: requestId,
      senderId: requestData.senderId,
      senderName: requestData.senderName,
      senderUniversity: requestData.senderUniversity,
      senderPhone: requestData.senderPhone,
      senderWhatsApp: requestData.senderWhatsApp || requestData.senderPhone,
      targetUniversity: requestData.targetUniversity,
      targetRepresentativeName: requestData.targetRepresentativeName || "",
      targetRepresentativePhone: requestData.targetRepresentativePhone || "",
      title: requestData.title || `كشف سحب طلاب لجامعة ${requestData.targetUniversity}`,
      notes: requestData.notes || "",
      students: formattedStudents,
      totalStudents: formattedStudents.length,
      completedStudents: formattedStudents.filter(s => s.isCompleted).length,
      status: "pending", // 'pending' | 'partial' | 'completed'
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (this.isInitialized && this.requestsRef) {
      try {
        await this.requestsRef.child(requestId).set(newRequest);
      } catch (err) {
        console.warn("Firebase create request error:", err);
      }
    }

    const localRequests = this.getLocal('requests');
    localRequests.unshift(newRequest);
    this.saveLocal('requests', localRequests);

    // إرسال إشعار فوري لموظفي الجامعة المختارة إذا كانوا مسجلين
    // الإشعار خاص بالجامعة المستقبِلة فقط — المرسل نفسه لا يصله إشعار "واردكم كشف"
    try {
      const localUsers = this.getLocal('users');
      const cleanDigits = (v) => String(v || "")
        .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
        .replace(/\D/g, "");
      const senderPhoneDigits = cleanDigits(requestData.senderPhone);

      // دمج الأسماء العربية المتشابهة (الأ/ا، الهمزات، ى/ي، ة/ه) للتحقق من جامعة المستقبِلة
      const arabicNormalizeUni = (v) => String(v || "")
        .trim()
        .toLowerCase()
        .replace(/[اأإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه");
      const targetUniClean = arabicNormalizeUni(requestData.targetUniversity);

      // قراءة المستخدمين من قاعدة البيانات الحية (بديلاً عن القائمة المحلية القديمة في حالات الخلل)
      let freshUsers = [];
      if (this.isInitialized && this.usersRef) {
        try {
          const usersSnap = await this.usersRef.once('value');
          const remoteUsers = usersSnap.val();
          if (remoteUsers) {
            freshUsers = Object.keys(remoteUsers).map(key => ({ id: key, ...(remoteUsers[key] || {}) }));
          }
        } catch (e) {
          freshUsers = localUsers;
        }
      }
      if (freshUsers.length === 0) freshUsers = localUsers;

      const targetEmployees = freshUsers.filter(u => {
        if (!u) return false;
        // 1) يجب أن يكون موظفاً في الجامعة المستهدفة (الجامعة المستقبِلة للكشف)
        if (arabicNormalizeUni(u.university || "") !== targetUniClean) return false;
        // 2) استبعاد المرسل نفسه: بنفس المعرّف أو بنفس رقم الهاتف
        if (u.id === requestData.senderId) return false;
        const uPhoneDigits = cleanDigits(u.phone);
        if (senderPhoneDigits && uPhoneDigits && uPhoneDigits === senderPhoneDigits) return false;
        return true;
      });

      // إشعار بديل لمجاموعته لو لم يُعثر على موظف محدد (حد أمان للشبكة)
      const universityFallbackKey = String(targetUniClean || "").replace(/\s+/g, "_");

      for (const emp of targetEmployees) {
        await this.sendNotification({
          recipientUserId: emp.id,
          recipientUniversity: targetUniClean,
          senderUserId: requestData.senderId || "",
          senderName: requestData.senderName || "مسؤول شئون طلاب",
          senderUniversity: requestData.senderUniversity || "",
          senderPhone: requestData.senderPhone || "",
          targetUniversity: requestData.targetUniversity || "",
          requestId: requestId,
          message: `وردكم كشف سحب طلاب جديد من (${requestData.senderUniversity}) بواسطة الزميل ${requestData.senderName} يضم ${formattedStudents.length} طلاب 📩`,
          type: "new_request"
        });
      }

      if (targetEmployees.length === 0) {
        // إشعار لمجاموعته — يظهري للمستخدمين المسجلين في جامعتها فقط
        await this.sendNotification({
          recipientUserId: "uni_" + universityFallbackKey,
          recipientUniversity: targetUniClean,
          senderUserId: requestData.senderId || "",
          senderName: requestData.senderName || "مسؤول شئون طلاب",
          senderUniversity: requestData.senderUniversity || "",
          senderPhone: requestData.senderPhone || "",
          targetUniversity: requestData.targetUniversity || "",
          requestId: requestId,
          message: `وردكم كشف سحب طلاب جديد من (${requestData.senderUniversity}) بواسطة الزميل ${requestData.senderName} يضم ${formattedStudents.length} طلاب 📩`,
          type: "new_request"
        });
      }
    } catch (notifErr) {
      console.warn("Target university notification error:", notifErr);
    }

    return { success: true, request: newRequest };
  }

  // تحديث حالة طالب في كشف معين (تم السحب + ملاحظات)
  async updateStudentInRequest(requestId, studentId, updates, updatedByEmployee) {
    const localRequests = this.getLocal('requests');
    const reqIndex = localRequests.findIndex(r => r.id === requestId);
    let targetRequest = reqIndex !== -1 ? localRequests[reqIndex] : null;

    if (!targetRequest && this.isInitialized && this.requestsRef) {
      try {
        const snap = await this.requestsRef.child(requestId).once('value');
        targetRequest = snap.val();
      } catch (e) {
        console.warn("Fetch request error:", e);
      }
    }

    if (!targetRequest || !targetRequest.students) {
      return { success: false, error: "Request not found" };
    }

    const studentIndex = targetRequest.students.findIndex(s => s.id === studentId);
    if (studentIndex === -1) {
      return { success: false, error: "Student not found" };
    }

    const currentStudent = targetRequest.students[studentIndex];
    const prevStatus = currentStudent.isCompleted;

    // تطبيق التحديثات
    const updatedStudent = {
      ...currentStudent,
      ...updates,
      updatedAt: Date.now()
    };

    if (updates.isCompleted !== undefined) {
      if (updates.isCompleted) {
        updatedStudent.completedAt = Date.now();
        updatedStudent.completedByName = updatedByEmployee ? updatedByEmployee.fullName : "مسؤول الجامعة";
      } else {
        updatedStudent.completedAt = null;
        updatedStudent.completedByName = null;
      }
    }

    targetRequest.students[studentIndex] = updatedStudent;

    // إعادة حساب الإحصائيات للكشف
    const completedCount = targetRequest.students.filter(s => s.isCompleted).length;
    const totalCount = targetRequest.students.length;
    let newStatus = "pending";
    if (completedCount === totalCount && totalCount > 0) {
      newStatus = "completed";
    } else if (completedCount > 0) {
      newStatus = "partial";
    }

    targetRequest.completedStudents = completedCount;
    targetRequest.status = newStatus;
    targetRequest.updatedAt = Date.now();

    // حفظ محلي
    if (reqIndex !== -1) {
      localRequests[reqIndex] = targetRequest;
      this.saveLocal('requests', localRequests);
    }

    // حفظ سحابي
    if (this.isInitialized && this.requestsRef) {
      try {
        await this.requestsRef.child(requestId).update({
          students: targetRequest.students,
          completedStudents: completedCount,
          status: newStatus,
          updatedAt: Date.now()
        });
      } catch (e) {
        console.warn("Firebase update student error:", e);
      }
    }

    // إرسال إشعار للموظف المرسل إذا حدث تغيير في الحالة أو الملاحظة
    if (targetRequest.senderId && updatedByEmployee) {
      let notifMessage = "";
      let notifType = "status_changed";

      if (updates.isCompleted !== undefined && updates.isCompleted !== prevStatus) {
        if (updates.isCompleted) {
          notifMessage = `قام الزميل ${updatedByEmployee.fullName} (${updatedByEmployee.university}) بتأكيد سحب ملف الطالب: "${currentStudent.name}" ✅`;
          if (updates.notes) notifMessage += ` - ملاحظات: "${updates.notes}"`;
        } else {
          notifMessage = `تم إلغاء تأكيد سحب ملف الطالب: "${currentStudent.name}" بواسطة ${updatedByEmployee.fullName}`;
        }
      } else if (updates.notes !== undefined && updates.notes !== currentStudent.notes) {
        notifMessage = `أضاف الزميل ${updatedByEmployee.fullName} (${updatedByEmployee.university}) ملاحظة على الطالب "${currentStudent.name}": "${updates.notes}" 📝`;
        notifType = "notes_updated";
      }

      if (notifMessage) {
        await this.sendNotification({
          recipientUserId: targetRequest.senderId,
          senderUserId: updatedByEmployee.id,
          senderName: updatedByEmployee.fullName,
          senderUniversity: updatedByEmployee.university,
          requestId: targetRequest.id,
          studentName: currentStudent.name,
          message: notifMessage,
          type: notifType
        });
      }
    }

    return { success: true, student: updatedStudent, request: targetRequest };
  }

  async addStudentToRequest(requestId, studentName, nationalId) {
    const localRequests = this.getLocal('requests');
    const reqIndex = localRequests.findIndex(r => r.id === requestId);
    let targetRequest = reqIndex !== -1 ? localRequests[reqIndex] : null;

    if (!targetRequest && this.isInitialized && this.requestsRef) {
      try {
        const snap = await this.requestsRef.child(requestId).once('value');
        targetRequest = snap.val();
      } catch (e) {
        console.warn("Fetch request error:", e);
      }
    }

    if (!targetRequest) return { success: false, error: "Request not found" };

    if (!targetRequest.students) targetRequest.students = [];

    // يقبل استدعاء إما اسم فقط أو كائن { name, nationalId }
    let cleanName = studentName;
    let cleanNationalId = nationalId || "";
    if (studentName && typeof studentName === "object") {
      cleanName = (studentName.name || "").toString();
      cleanNationalId = (studentName.nationalId || "").toString().trim();
    }

    const newStudent = {
      id: `st_${Date.now()}_${targetRequest.students.length + 1}`,
      name: cleanName.trim(),
      nationalId: cleanNationalId,
      isCompleted: false,
      notes: "",
      completedAt: null,
      completedByName: null,
      updatedAt: Date.now()
    };

    targetRequest.students.push(newStudent);
    targetRequest.totalStudents = targetRequest.students.length;
    targetRequest.completedStudents = targetRequest.students.filter(s => s.isCompleted).length;
    targetRequest.status = targetRequest.completedStudents === targetRequest.totalStudents ? "completed" : (targetRequest.completedStudents > 0 ? "partial" : "pending");
    targetRequest.updatedAt = Date.now();

    if (reqIndex !== -1) {
      localRequests[reqIndex] = targetRequest;
      this.saveLocal('requests', localRequests);
    }

    if (this.isInitialized && this.requestsRef) {
      try {
        await this.requestsRef.child(requestId).update({
          students: targetRequest.students,
          totalStudents: targetRequest.totalStudents,
          completedStudents: targetRequest.completedStudents,
          status: targetRequest.status,
          updatedAt: Date.now()
        });
      } catch (e) {
        console.warn("Firebase add student error:", e);
      }
    }

    return { success: true, student: newStudent, request: targetRequest };
  }

  async deleteStudentFromRequest(requestId, studentId) {
    const localRequests = this.getLocal('requests');
    const reqIndex = localRequests.findIndex(r => r.id === requestId);
    let targetRequest = reqIndex !== -1 ? localRequests[reqIndex] : null;

    if (!targetRequest && this.isInitialized && this.requestsRef) {
      try {
        const snap = await this.requestsRef.child(requestId).once('value');
        targetRequest = snap.val();
      } catch (e) {
        console.warn("Fetch request error:", e);
      }
    }

    if (!targetRequest || !targetRequest.students) return { success: false, error: "Request not found" };

    targetRequest.students = targetRequest.students.filter(s => s.id !== studentId);
    targetRequest.totalStudents = targetRequest.students.length;
    targetRequest.completedStudents = targetRequest.students.filter(s => s.isCompleted).length;
    targetRequest.status = targetRequest.totalStudents === 0 ? "pending" : (targetRequest.completedStudents === targetRequest.totalStudents ? "completed" : (targetRequest.completedStudents > 0 ? "partial" : "pending"));
    targetRequest.updatedAt = Date.now();

    if (reqIndex !== -1) {
      localRequests[reqIndex] = targetRequest;
      this.saveLocal('requests', localRequests);
    }

    if (this.isInitialized && this.requestsRef) {
      try {
        await this.requestsRef.child(requestId).update({
          students: targetRequest.students,
          totalStudents: targetRequest.totalStudents,
          completedStudents: targetRequest.completedStudents,
          status: targetRequest.status,
          updatedAt: Date.now()
        });
      } catch (e) {
        console.warn("Firebase delete student error:", e);
      }
    }

    return { success: true, request: targetRequest };
  }

  async deleteWithdrawalRequest(requestId) {
    if (this.isInitialized && this.requestsRef) {
      try {
        await this.requestsRef.child(requestId).remove();
      } catch (e) {
        console.warn("Firebase delete request error:", e);
      }
    }
    const localRequests = this.getLocal('requests').filter(r => r.id !== requestId);
    this.saveLocal('requests', localRequests);
    return { success: true };
  }

  // ==========================================
  // 4. مركز الإشعارات الحية (Realtime Notifications)
  // ==========================================

  subscribeNotifications(callback) {
    if (this.isInitialized && this.notificationsRef) {
      this.notificationsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        let notifs = [];
        if (data) {
          notifs = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
        this.saveLocal('notifications', notifs);
        callback(notifs, true);
      }, (error) => {
        console.warn("Firebase notifications read error:", error);
        callback(this.getLocal('notifications'), false);
      });
    } else {
      callback(this.getLocal('notifications'), false);
    }
  }

  async sendNotification(notifData) {
    const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const notification = {
      id: notifId,
      recipientUserId: notifData.recipientUserId || "",
      recipientUniversity: notifData.recipientUniversity || "",
      senderUserId: notifData.senderUserId || "",
      senderName: notifData.senderName || "",
      senderUniversity: notifData.senderUniversity || "",
      senderPhone: notifData.senderPhone || "",
      targetUniversity: notifData.targetUniversity || "",
      requestId: notifData.requestId || "",
      studentName: notifData.studentName || "",
      message: notifData.message,
      type: notifData.type || "info",
      isRead: false,
      createdAt: Date.now()
    };

    if (this.isInitialized && this.notificationsRef) {
      try {
        await this.notificationsRef.child(notifId).set(notification);
      } catch (e) {
        console.warn("Firebase send notification error:", e);
      }
    }

    const localNotifs = this.getLocal('notifications');
    localNotifs.unshift(notification);
    this.saveLocal('notifications', localNotifs);

    return { success: true, notification };
  }

  async markNotificationAsRead(notifId) {
    if (this.isInitialized && this.notificationsRef) {
      try {
        await this.notificationsRef.child(notifId).remove();
      } catch (e) {
        console.warn("Firebase remove notif error:", e);
      }
    }

    const localNotifs = this.getLocal('notifications').filter(n => n.id !== notifId);
    this.saveLocal('notifications', localNotifs);

    return { success: true };
  }

  async markAllNotificationsAsRead(recipientUserId, userPhone, userUniversity) {
    const cleanPhone = (userPhone || "").replace(/\D/g, "");
    const cleanUni = (userUniversity || "").toLowerCase().trim();
    const localNotifs = this.getLocal('notifications');
    const remaining = [];
    const removes = {};

    localNotifs.forEach(n => {
      const matchRecipient = (
        n.recipientUserId === recipientUserId ||
        (cleanPhone && n.recipientUserId === cleanPhone) ||
        (cleanPhone && n.recipientUserId === ('usr_' + cleanPhone)) ||
        (cleanUni && (n.recipientUniversity || "").toLowerCase().trim() === cleanUni)
      );

      if (matchRecipient) {
        removes[n.id] = null;
      } else {
        remaining.push(n);
      }
    });

    this.saveLocal('notifications', remaining);

    if (this.isInitialized && this.notificationsRef && Object.keys(removes).length > 0) {
      try {
        await this.notificationsRef.update(removes);
      } catch (e) {
        console.warn("Firebase mark all remove error:", e);
      }
    }

    return { success: true };
  }

  async deleteNotification(notifId) {
    return this.markNotificationAsRead(notifId);
  }

  // ==========================================
  // 5. إدارة الجلسة للمستخدم الحالي (Session Storage)
  // ==========================================

  getCurrentUser() {
    try {
      const u = localStorage.getItem(this.storageKeys.session);
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  setCurrentUser(user) {
    try {
      if (user) {
        localStorage.setItem(this.storageKeys.session, JSON.stringify(user));
      } else {
        localStorage.removeItem(this.storageKeys.session);
      }
    } catch (e) {
      console.error("Failed to save current user session:", e);
    }
  }

  clearCurrentUser() {
    localStorage.removeItem(this.storageKeys.session);
  }

  // دوال التوافق مع الكود القديم لضمان عدم حدوث أي خلل
  subscribe(callback) {
    return this.subscribeRepresentatives(callback);
  }

  add(rep) {
    return this.addRepresentative(rep);
  }

  update(id, updates) {
    return this.updateRepresentative(id, updates);
  }

  delete(id) {
    return this.deleteRepresentative(id);
  }

  // ==========================================
  // 6. قائمة الجامعات المركزية (Central Universities)
  // محكومة من لوحة الإدارة وتنعكس على كافة قوائم الاختيار
  // ==========================================

  // تفريغ مفاتيح Firebase إلى مصفوفة أسماء نظيفة
  parseUniversitiesSnapshot(data) {
    const rawList = (data && data.list) ? data.list : [];
    const parsed = Array.isArray(rawList)
      ? rawList
      : Object.values(rawList || {});
    return parsed.map(u => (u || "").toString().trim()).filter(Boolean);
  }

  subscribeUniversities(callback) {
    if (this.isInitialized && this.universitiesRef) {
      this.universitiesRef.on('value', (snapshot) => {
        const data = snapshot.val();
        const list = this.parseUniversitiesSnapshot(data);
        this.saveLocal('universities', list);
        // hasData = true فقط إذا قام الإدارة بحفظ القائمة فعلياً من قبل
        const hasData = !!(data && (data.initialized || list.length > 0));
        callback(list, hasData);
      }, (error) => {
        console.warn("Firebase universities read error:", error);
        const local = this.getLocal('universities');
        callback(local, local.length > 0);
      });
    } else {
      const local = this.getLocal('universities');
      callback(local, local.length > 0);
    }
  }

  // حفظ القائمة كاملة (إضافة أو تعديل أو حذف يتم هنا بتمرير القائمة الجديدة)
  async saveUniversitiesList(uniList) {
    const clean = Array.from(new Set((uniList || [])
      .map(u => (u || "").toString().trim())
      .filter(Boolean)));

    const payload = {
      list: clean,
      initialized: true,
      updatedAt: Date.now()
    };

    if (this.isInitialized && this.universitiesRef) {
      try {
        await this.universitiesRef.set(payload);
      } catch (error) {
        console.error("Failed to save universities to Firebase:", error);
      }
    }

    // نسخة احتياطية محلية دائماً (للعمل بدون إنترنت أيضاً)
    this.saveLocal('universities', clean);
    return clean;
  }

  // توحيد نص اسم الجامعة لمقارنة الأسماء المتشابهة ومنع التكرار
  normalizeUniversityText(str) {
    return String(str || "")
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u0652]/g, "") // إزالة التشكيل
      .replace(/[أإآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, " ");
  }

  // القائمة الحالية المعتمدة للجامعات (المحفوظة من الإدارة إن وُجدت وإلا الافتراضية)
  getConfiguredUniversities() {
    if (typeof getActiveUniversities === "function") {
      const active = getActiveUniversities();
      if (Array.isArray(active)) return active;
    }
    return this.getLocal('universities') || [];
  }

  // إضافة جامعة جديدة إلى القائمة المركزية إن لم تكن موجودة
  // تُستدعى تلقائياً عند تسجيل موظف جديد باسم جامعة غير مدرجة في القائمة
  // القيمة المُرجعة: true إذا تمت الإضافة فعل / false إذا كانت موجودة مسبقاً
  async addUniversityIfMissing(uniName) {
    const clean = (uniName || "").toString().trim();
    if (!clean) return false;

    const current = this.getConfiguredUniversities() || [];
    const normalized = this.normalizeUniversityText(clean);
    const exists = current.some(u => this.normalizeUniversityText(u) === normalized);
    if (exists) {
      return false;
    }

    const updated = [...current, clean];
    await this.saveUniversitiesList(updated);
    return true;
  }
}

window.firebaseService = new FirebaseService();
