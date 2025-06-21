import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ✅ إعداد اتصال Supabase
const supabase = createClient(
  "https://vyhtsdqccyvygelekzey.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5aHRzZHFjY3l2eWdlbGVremV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NTQwOTMsImV4cCI6MjA2NTMzMDA5M30.bRjHD6OkziXjfavEX-tA-6IFdag7KoFBqLRgNLqwcdg"
);

let uploadedRows = []; // ✅ الصفوف المحملة مؤقتًا

// ✅ عنصر الحالة
function setStatus(text, color) {
  const status = document.getElementById("uploadStatus");
  status.innerText = text;
  status.style.color = color;
}

// ✅ قراءة الملف وتحويله لصفوف
window.uploadExcel = async function () {
  const fileInput = document.getElementById("excelFile");
  const status = document.getElementById("uploadStatus");
  const loader = document.getElementById("uploadLoader");
  const agent_id = document.getElementById("agentSelect").value;

  if (!agent_id) {
    return setStatus("⚠️ اختر المندوب أولاً.", "red");
  }
  if (!fileInput.files.length) {
    return setStatus("📄 اختر ملف أولاً.", "red");
  }

  try {
    loader.style.display = "block";
    setStatus("", "");
    const file = fileInput.files[0];
    const data = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) {
      loader.style.display = "none";
      return setStatus("❌ الملف فارغ أو التنسيق غير صحيح.", "red");
    }

    uploadedRows = rows.map((row) => ({
      name: row.name?.toString().trim() || "",
      phone: row.phone?.toString().trim(),
      address: row.address?.toString().trim() || "",
      due_amount: Number(row.due_amount) || 0,
      section: row.section?.toString().trim() || "",
    }));

    loader.style.display = "none";
    setStatus("✅ الملف جاهز للمعاينة قبل الرفع النهائي", "green");
    displayTable();
  } catch (err) {
    loader.style.display = "none";
    console.error("❌ حدث خطأ:", err.message);
    setStatus("❌ حدث خطأ غير متوقع.", "red");
  }
};

// ✅ عرض الجدول على الصفحة
function displayTable() {
  const container = document.getElementById("tableContainer");
  container.innerHTML = ""; // تفريغ الجدول الحالي
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>القسم</th><th>المبلغ</th><th>حذف</th>
      </tr>
    </thead>
    <tbody>
      ${uploadedRows
        .map(
          (row, index) => `
            <tr>
              <td><input value="${row.name}" data-index="${index}" data-field="name"></td>
              <td><input value="${row.phone}" data-index="${index}" data-field="phone"></td>
              <td><input value="${row.address}" data-index="${index}" data-field="address"></td>
              <td><input value="${row.section}" data-index="${index}" data-field="section"></td>
              <td><input type="number" value="${row.due_amount}" data-index="${index}" data-field="due_amount"></td>
              <td><button data-index="${index}" class="deleteRowButton">❌</button></td>
            </tr>
          `
        )
        .join("")}
    </tbody>`;
  container.appendChild(table);

  // ✅ تفعيل الحدث على الحقول
  container.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", handleInputChange);
  });
  container.querySelectorAll(".deleteRowButton").forEach((btn) => {
    btn.addEventListener("click", deleteRow);
  });
}

// ✅ تحديث القيم عند التغيير
function handleInputChange(event) {
  const index = event.target.getAttribute("data-index");
  const field = event.target.getAttribute("data-field");
  uploadedRows[index][field] = event.target.value.trim();
}

// ✅ حذف صف
function deleteRow(event) {
  const index = event.target.getAttribute("data-index");
  uploadedRows.splice(index, 1);
  displayTable();
}

// ✅ إضافة صف
window.addRow = function () {
  uploadedRows.push({
    name: "",
    phone: "",
    address: "",
    due_amount: 0,
    section: "",
  });
  displayTable();
};

// ✅ تأكيد الرفع النهائي
window.confirmUpload = async function () {
  const status = document.getElementById("uploadStatus");
  const loader = document.getElementById("uploadLoader");
  const agent_id = document.getElementById("agentSelect").value;

  loader.style.display = "block";

  const currentMonth = new Date().toISOString().slice(0, 7);
  const newCustomers = [];
  const updates = [];

  for (const row of uploadedRows) {
    const phone = row.phone.trim();
    const due_amount = Number(row.due_amount) || 0;

    if (!phone || due_amount <= 0) continue;

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .eq("agent_id", agent_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.warn("⚠️ خطأ في جلب العميل:", fetchError.message);
      continue;
    }

    if (existing) {
      if (existing.collection_status === "تم التحصيل") {
        newCustomers.push({
          name: row.name,
          phone,
          address: row.address,
          due_amount,
          agent_id,
          section: row.section,
          billing_month: currentMonth,
          collection_status: "لم يتم التحصيل",
        });
      } else {
        updates.push({
          id: existing.id,
          due_amount: (existing.due_amount || 0) + due_amount,
          billing_month: currentMonth,
        });
      }
    } else {
      newCustomers.push({
        name: row.name,
        phone,
        address: row.address,
        due_amount,
        agent_id,
        section: row.section,
        billing_month: currentMonth,
        collection_status: "لم يتم التحصيل",
      });
    }
  }

  // ✅ إدخال عملاء جدد
  if (newCustomers.length > 0) {
    const { error: insertError } = await supabase
      .from("customers")
      .insert(newCustomers);
    if (insertError) {
      console.error("❌ خطأ أثناء الإدخال:", insertError.message);
      setStatus("❌ فشل إدخال البيانات الجديدة.", "red");
    }
  }

  // ✅ تحديث العملاء الحاليين
  for (const u of updates) {
    const { error: updateError } = await supabase
      .from("customers")
      .update({ due_amount: u.due_amount, billing_month: u.billing_month })
      .eq("id", u.id);
    if (updateError) {
      console.error(`❌ فشل تحديث العميل ${u.id}:`, updateError.message);
    }
  }

  loader.style.display = "none";
  setStatus("✅ تم رفع وتحديث البيانات بنجاح.", "green");

  uploadedRows = [];
  document.getElementById("tableContainer").innerHTML = ""; // تفريغ الجدول
  document.getElementById("addRowButton").style.display = "none";
  document.getElementById("confirmUploadButton").style.display = "none";
};
