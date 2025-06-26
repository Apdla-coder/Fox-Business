import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

const supabase = createClient(
  "https://vyhtsdqccyvygelekzey.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5aHRzZHFjY3l2eWdlbGVremV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NTQwOTMsImV4cCI6MjA2NTMzMDA5M30.bRjHD6OkziXjfavEX-tA-6IFdag7KoFBqLRgNLqwcdg"
);

// =========================== تشغيل أولي ===========================
window.onload = async () => {
  await loadAgentsOptions();
  attachEventListeners();

  const agentSelect = document.getElementById("agentSelect");
  if (agentSelect.value) {
    loadCustomers(agentSelect.value);
    loadSections(agentSelect.value);
  }
};

function attachEventListeners() {
  document
    .getElementById("excelUploadButton")
    ?.addEventListener("click", uploadExcel);
  document
    .getElementById("clearButton")
    ?.addEventListener("click", clearAllData);
  document
    .getElementById("addAgentButton")
    ?.addEventListener("click", addAgent);
  document
    .getElementById("addSectionButton")
    ?.addEventListener("click", addSection);
  document
    .getElementById("addCustomerButton")
    ?.addEventListener("click", addCustomer);

  const agentSelector = document.getElementById("agentSelect");
  agentSelector?.addEventListener("change", (e) => {
    if (e.target.value) {
      loadCustomers(e.target.value);
      loadSections(e.target.value);
    }
  });
}

// =========================== تحميل قائمة المناديب ===========================
async function loadAgentsOptions() {
  const select = document.getElementById("agentSelect");
  if (!select) return;

  select.innerHTML = '<option value="">-- اختر مندوب --</option>';
  const { data: agents, error } = await supabase.from("agents").select("*");
  if (error) {
    alert("❌ خطأ أثناء تحميل قائمة المندوبين");
    return;
  }
  agents?.forEach((agent) => {
    const option = document.createElement("option");
    option.value = agent.id;
    option.textContent = agent.name;
    select.appendChild(option);
  });
}

// =========================== رفع ملف Excel ===========================
async function uploadExcel() {
  const fileInput = document.getElementById("excelFile");
  const loader = document.getElementById("uploadLoader");
  const agent_id = document.getElementById("agentSelect").value;

  if (!agent_id) return setStatus("⚠️ اختر المندوب أولاً.", "red");
  if (!fileInput.files.length) return setStatus("📄 اختر ملف أولاً.", "red");

  try {
    loader.style.display = "block";
    setStatus("", "");
    const file = fileInput.files[0];
    const data = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length)
      return setStatus("❌ الملف فارغ أو التنسيق غير صحيح.", "red");

    const currentMonth = new Date().toISOString().slice(0, 7);
    const newCustomers = [];
    const updates = [];

    for (const row of rows) {
      const phone = row.phone?.toString().trim();
      const due_amount = Number(row.due_amount) || 0;

      if (!phone || due_amount <= 0) continue;

      const { data: existing } = await supabase
        .from("customers")
        .select("*")
        .eq("phone", phone)
        .eq("agent_id", agent_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        if (existing.collection_status === "تم التحصيل") {
          newCustomers.push({
            ...row,
            agent_id,
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
          ...row,
          agent_id,
          billing_month: currentMonth,
          collection_status: "لم يتم التحصيل",
        });
      }
    }

    if (newCustomers.length) {
      const { error: insertError } = await supabase
        .from("customers")
        .insert(newCustomers);
      if (insertError)
        return setStatus("❌ فشل إدخال البيانات الجديدة.", "red");
    }

    for (const u of updates) {
      await supabase
        .from("customers")
        .update({ due_amount: u.due_amount, billing_month: u.billing_month })
        .eq("id", u.id);
    }

    setStatus("✅ تم رفع وتحديث البيانات بنجاح.", "green");
    fileInput.value = "";
    loadCustomers(agent_id);
  } catch (err) {
    console.error("❌ حدث خطأ:", err.message);
    setStatus("❌ حدث خطأ غير متوقع.", "red");
  } finally {
    loader.style.display = "none";
  }
}

// =========================== مسح كل البيانات ===========================
async function clearAllData() {
  const status = document.getElementById("clearStatus");
  if (!confirm("⚠️ هل أنت متأكد أنك تريد حذف جميع البيانات؟")) return;

  await supabase.from("collections").delete().not("id", "is", null);
  await supabase.from("customers").delete().not("id", "is", null);
  status.innerText = "✅ تم حذف جميع البيانات بنجاح.";
  status.style.color = "green";
}

// =========================== إعداد الرسالة ===========================
function setStatus(msg, color) {
  const el = document.getElementById("uploadStatus");
  el.innerText = msg;
  el.style.color = color;
}

// =========================== إضافة مندوب ===========================
async function addAgent() {
  const name = document.getElementById("newAgentName").value.trim();
  const email = document.getElementById("newAgentEmail").value.trim();
  const password = document.getElementById("newAgentPassword").value.trim();
  const role = document.getElementById("newAgentRole").value;

  const alertBox = document.getElementById("addAgentAlert");
  if (!name || !email || !password) {
    alertBox.innerText = "يرجى ملء جميع الحقول.";
    alertBox.style.display = "block";
    alertBox.style.backgroundColor = "#f8d7da";
    alertBox.style.color = "#721c24";
    return;
  }

  const { error } = await supabase
    .from("agents")
    .insert([{ name, email, password, role }]);
  if (error) {
    alertBox.innerText = "حدث خطأ أثناء إضافة المندوب.";
    alertBox.style.display = "block";
    alertBox.style.backgroundColor = "#f8d7da";
    alertBox.style.color = "#721c24";
  } else {
    alertBox.innerText = "تمت إضافة المندوب بنجاح ✅";
    alertBox.style.display = "block";
    alertBox.style.backgroundColor = "#d4edda";
    alertBox.style.color = "#155724";
    document.getElementById("newAgentName").value = "";
    document.getElementById("newAgentEmail").value = "";
    document.getElementById("newAgentPassword").value = "";
  }
}

// =========================== تحميل العملاء ===========================
async function loadCustomers(agent_id) {
  const { data: customers, error } = await supabase
    .from("customers")
    .select("*")
    .eq("agent_id", agent_id)
    .order("section", { ascending: true });

  if (error) {
    alert("❌ حدث خطأ أثناء جلب العملاء");
    return;
  }

  const tableContainer = document.getElementById("customersTable");
  const tableBody = tableContainer.querySelector("tbody");
  tableBody.innerHTML = "";

  if (!customers?.length) {
    tableBody.innerHTML = '<tr><td colspan="5">لا توجد عملاء</td></tr>';
    return;
  }

  const groupedCustomers = customers.reduce((acc, customer) => {
    const section = customer.section || "غير محدد";
    if (!acc[section]) acc[section] = [];
    acc[section].push(customer);
    return acc;
  }, {});

  for (const sectionName in groupedCustomers) {
    const sectionRow = document.createElement("tr");
    sectionRow.innerHTML = `<td colspan="5" style="background-color: #34495e; font-weight: bold;">
      📁 القسم: ${sectionName}
    </td>`;
    tableBody.appendChild(sectionRow);

    groupedCustomers[sectionName].forEach((cust) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="text" value="${cust.name}" data-id="${
        cust.id
      }" data-field="name"/></td>
        <td><input type="text" value="${cust.phone}" data-id="${
        cust.id
      }" data-field="phone"/></td>
        <td><input type="number" value="${cust.due_amount}" data-id="${
        cust.id
      }" data-field="due_amount"/></td>
        <td>
          <select data-id="${cust.id}" data-field="collection_status">
            <option ${
              cust.collection_status === "تم التحصيل" ? "selected" : ""
            }>تم التحصيل</option>
            <option ${
              cust.collection_status !== "تم التحصيل" ? "selected" : ""
            }>لم يتم التحصيل</option>
          </select>
        </td>
        <td><button data-id="${cust.id}" class="saveBtn">💾 حفظ</button></td>`;
      tableBody.appendChild(row);
    });
  }
}

// =========================== حفظ تعديلات الجدول ===========================
document
  .querySelector("#customersTable")
  ?.addEventListener("click", async (e) => {
    if (e.target.classList.contains("saveBtn")) {
      const id = e.target.getAttribute("data-id");
      const inputs = document.querySelectorAll(`[data-id="${id}"]`);

      const updatedData = {};
      inputs.forEach((input) => {
        updatedData[input.getAttribute("data-field")] = input.value.trim();
      });
      const { error } = await supabase
        .from("customers")
        .update(updatedData)
        .eq("id", id);
      if (error) {
        alert("❌ حدث خطأ أثناء حفظ البيانات");
        console.error(error);
      } else {
        alert("✅ تم حفظ التعديلات بنجاح");
      }
    }
  });

// =========================== تحميل الأقسام ===========================
async function loadSections(agent_id) {
  const { data: customers, error } = await supabase
    .from("customers")
    .select("section")
    .eq("agent_id", agent_id);
  if (error) {
    console.error(error);
    return;
  }
  const sections = [
    ...new Set(customers.map((c) => c.section).filter(Boolean)),
  ];
  const select = document.getElementById("addCustomerSection");
  select.innerHTML = '<option value="">-- اختر القسم --</option>';
  sections.forEach((section) => {
    const option = document.createElement("option");
    option.value = section;
    option.textContent = section;
    select.appendChild(option);
  });
}

// =========================== إضافة قسم جديد ===========================
async function addSection() {
  const sectionName = document.getElementById("newSectionName").value.trim();
  const alertBox = document.getElementById("addSectionAlert");

  if (!sectionName) {
    alertBox.innerText = "❌ أدخل اسم القسم.";
    alertBox.style.display = "block";
    alertBox.style.color = "#721c24";
    return;
  }
  alertBox.innerText = "✅ يمكنك استخدام هذا القسم عند إضافة العملاء.";
  alertBox.style.display = "block";
  alertBox.style.color = "#155724";
  document.getElementById("newSectionName").value = "";
}

// =========================== إضافة عميل لقسم مخصص ===========================
async function addCustomer() {
  const agent_id = document.getElementById("agentSelect").value;
  const section = document.getElementById("addCustomerSection").value.trim();
  const name = document.getElementById("addCustomerName").value.trim();
  const phone = document.getElementById("addCustomerPhone").value.trim();
  const due_amount = Number(
    document.getElementById("addCustomerDueAmount").value.trim()
  );
  const alertBox = document.getElementById("addCustomerAlert");

  if (!agent_id || !section || !name || !phone || !due_amount) {
    alertBox.innerText = "❌ برجاء ملء جميع الحقول.";
    alertBox.style.display = "block";
    alertBox.style.color = "#721c24";
    return;
  }

  const { error } = await supabase.from("customers").insert([
    {
      agent_id,
      section,
      name,
      phone,
      due_amount,
      billing_month: new Date().toISOString().slice(0, 7),
      collection_status: "لم يتم التحصيل",
    },
  ]);

  if (error) {
    alertBox.innerText = "❌ حدث خطأ أثناء إضافة العميل.";
    alertBox.style.display = "block";
    alertBox.style.color = "#721c24";
  } else {
    alertBox.innerText = "✅ تم إضافة العميل بنجاح.";
    alertBox.style.display = "block";
    alertBox.style.color = "#155724";
    loadCustomers(agent_id);
    loadSections(agent_id);
    document.getElementById("addCustomerName").value = "";
    document.getElementById("addCustomerPhone").value = "";
    document.getElementById("addCustomerDueAmount").value = "";
  }
}
