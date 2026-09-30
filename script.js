// Flipkart Sales Intelligence — CSV-powered dashboard
// Keep monthly_sales.csv in the same folder as index.html and run with VS Code Live Server.

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const money = (value) =>
    "₹" + Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });

  const number = (value) => {
    const cleaned = String(value ?? "").replace(/[₹,\s%]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // CSV parser that supports commas inside quoted cells and escaped quotes.
  function parseCSV(text) {
    const input = text.replace(/^\uFEFF/, "").trim();
    if (!input) throw new Error("The CSV file is empty.");

    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (char === '"' && quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell.trim());
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && input[i + 1] === "\n") i++;
        row.push(cell.trim());
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
    if (rows.length < 2) throw new Error("The CSV has no data rows.");

    const headers = rows.shift().map((header) =>
      header.toLowerCase().replace(/^\uFEFF/, "").trim().replace(/[^a-z0-9]/g, "")
    );

    return rows.map((values) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? "";
      });
      return record;
    });
  }

  function getValue(row, ...possibleNames) {
    for (const name of possibleNames) {
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return "";
  }

  let allSalesData = [];
  let salesChart = null;
  let ordersChart = null;

  function showNotice(message, type = "info") {
    const notice = $("#dataNotice");
    if (!notice) return;

    notice.innerHTML = "";
    const icon = document.createElement("span");
    icon.className = "notice-icon";
    icon.textContent = type === "error" ? "!" : "ⓘ";

    const text = document.createElement("span");
    text.textContent = message;

    notice.append(icon, text);
    notice.dataset.state = type;
  }

  function getSelectedData() {
    const selectedMonth = $("#monthFilter")?.value || "all";
    return selectedMonth === "all"
      ? allSalesData
      : allSalesData.filter((item) => item.month === selectedMonth);
  }

  function updateKPIs(data) {
    const totalSales = data.reduce((sum, item) => sum + item.sales, 0);
    const totalProfit = data.reduce((sum, item) => sum + item.profit, 0);
    const totalOrders = data.reduce((sum, item) => sum + item.orders, 0);
    const margin = totalSales ? (totalProfit / totalSales) * 100 : 0;

    $("#totalSales").textContent = money(totalSales);
    $("#totalProfit").textContent = money(totalProfit);
    $("#totalOrders").textContent = totalOrders.toLocaleString("en-IN");
    $("#profitMargin").textContent = margin.toFixed(2) + "%";
  }

  function createCharts(data) {
    if (typeof Chart === "undefined") {
      showNotice("Chart.js could not load. Check your internet connection and refresh.", "error");
      return;
    }

    const labels = data.map((item) => item.month);
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#aab5cc", usePointStyle: true, boxWidth: 8 }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y ?? 0;
              return `${context.dataset.label}: ${
                context.dataset.label === "Orders"
                  ? value.toLocaleString("en-IN")
                  : money(value)
              }`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#8d9bb5", maxRotation: 45, minRotation: 0 },
          grid: { color: "rgba(148, 163, 184, 0.08)" }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#8d9bb5",
            callback(value) {
              return Number(value).toLocaleString("en-IN");
            }
          },
          grid: { color: "rgba(148, 163, 184, 0.10)" }
        }
      }
    };

    const salesCanvas = $("#salesChart");
    const ordersCanvas = $("#ordersChart");

    if (salesCanvas) {
      if (salesChart) salesChart.destroy();
      salesChart = new Chart(salesCanvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Revenue",
              data: data.map((item) => item.sales),
              backgroundColor: "rgba(229, 9, 20, 0.82)",
              borderColor: "#e50914",
              borderWidth: 1,
              borderRadius: 5
            },
            {
              label: "Profit",
              data: data.map((item) => item.profit),
              backgroundColor: "rgba(255, 92, 102, 0.82)",
              borderColor: "#ff5c66",
              borderWidth: 1,
              borderRadius: 5
            }
          ]
        },
        options: chartOptions
      });
    }

    if (ordersCanvas) {
      if (ordersChart) ordersChart.destroy();
      ordersChart = new Chart(ordersCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Orders",
            data: data.map((item) => item.orders),
            borderColor: "#f04452",
            backgroundColor: "rgba(229, 9, 20, 0.14)",
            pointBackgroundColor: "#f04452",
            pointRadius: 3,
            borderWidth: 2,
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          ...chartOptions,
          plugins: {
            ...chartOptions.plugins,
            legend: { display: false }
          }
        }
      });
    }
  }

  function updateTable(data) {
    const tbody = $("#salesTable");
    if (!tbody) return;

    tbody.innerHTML = "";
    data.forEach((item) => {
      const row = document.createElement("tr");
      const margin = item.sales ? (item.profit / item.sales) * 100 : 0;
      [
        item.month,
        money(item.sales),
        money(item.profit),
        item.orders.toLocaleString("en-IN"),
        margin.toFixed(2) + "%"
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });

    const rowCount = $("#rowCount");
    if (rowCount) rowCount.textContent = `${data.length} record${data.length === 1 ? "" : "s"}`;
  }

  function updateInsights(data) {
    const grid = $("#insightsGrid");
    if (!grid || !data.length) return;

    const totalSales = data.reduce((sum, item) => sum + item.sales, 0);
    const totalProfit = data.reduce((sum, item) => sum + item.profit, 0);
    const bestMonth = data.reduce((best, item) => item.sales > best.sales ? item : best, data[0]);
    const bestProfitMonth = data.reduce((best, item) => item.profit > best.profit ? item : best, data[0]);
    const averageOrders = data.reduce((sum, item) => sum + item.orders, 0) / data.length;
    const insights = [
      ["Highest revenue month", `${bestMonth.month} recorded ${money(bestMonth.sales)} in revenue.`],
      ["Highest profit month", `${bestProfitMonth.month} generated ${money(bestProfitMonth.profit)} in profit.`],
      ["Overall profit margin", `${totalSales ? (totalProfit / totalSales * 100).toFixed(2) : "0.00"}% across the selected period.`],
      ["Average monthly orders", `${averageOrders.toLocaleString("en-IN", { maximumFractionDigits: 1 })} orders per month.`]
    ];

    grid.innerHTML = "";
    insights.forEach(([heading, description]) => {
      const card = document.createElement("article");
      card.className = "glass-panel insight-card";
      const title = document.createElement("h3");
      title.textContent = heading;
      const paragraph = document.createElement("p");
      paragraph.textContent = description;
      card.append(title, paragraph);
      grid.appendChild(card);
    });
  }

  function updateDashboard() {
    const data = getSelectedData();
    updateKPIs(data);
    updateTable(data);
    createCharts(data);
    updateInsights(data);
  }

  function populateMonthFilter(data) {
    const filter = $("#monthFilter");
    if (!filter) return;

    filter.innerHTML = '<option value="all">All months</option>';
    data.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.month;
      option.textContent = item.month;
      filter.appendChild(option);
    });
  }

  async function loadSalesCSV() {
    showNotice("Loading monthly_sales.csv…");

    try {
      const response = await fetch("./monthly_sales.csv", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not find monthly_sales.csv. Put it in the same folder as index.html.");
      }

      const rows = parseCSV(await response.text());
      if (!rows.length) throw new Error("The CSV contains no usable rows.");

      const headers = Object.keys(rows[0]);
      const required = [
        ["salesmonth", "month"],
        ["monthlysales", "totalsales"],
        ["monthlyprofit", "totalprofit"],
        ["totalorders", "orders"]
      ];

      const missing = required.filter((alternatives) =>
        !alternatives.some((name) => headers.includes(name))
      );
      if (missing.length) {
        throw new Error(
          "CSV columns must include sales_month, monthly_sales, monthly_profit and total_orders."
        );
      }

      allSalesData = rows.map((row) => ({
        month: String(getValue(row, "sales_month", "month")).trim(),
        sales: number(getValue(row, "monthly_sales", "total_sales")),
        profit: number(getValue(row, "monthly_profit", "total_profit")),
        orders: number(getValue(row, "total_orders", "orders"))
      })).filter((item) => item.month);

      allSalesData.sort((a, b) => a.month.localeCompare(b.month));
      if (!allSalesData.length) throw new Error("No valid monthly rows were found in the CSV.");

      populateMonthFilter(allSalesData);
      updateDashboard();
      showNotice(`Actual CSV data loaded successfully: ${allSalesData.length} months. Dashboard figures now use monthly_sales.csv.`);
    } catch (error) {
      console.error("CSV loading error:", error);
      showNotice(error.message, "error");
    }
  }

  $("#monthFilter")?.addEventListener("change", updateDashboard);
  $("#resetFilter")?.addEventListener("click", () => {
    if ($("#monthFilter")) $("#monthFilter").value = "all";
    updateDashboard();
  });

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  const dateLabel = $("#todayDate");
  if (dateLabel) {
    dateLabel.textContent = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  loadSalesCSV();

  // Keep the top navigation state in sync with the selected section.
  const navLinks = Array.from(document.querySelectorAll(".nav-link"));
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
    });
  });

  // SQL library: search cards and copy a query to the clipboard.
  const sqlSearch = $("#sqlSearch");
  const sqlGrid = $("#sqlGrid");
  const sqlResultCount = $("#sqlResultCount");
  const sqlEmpty = $("#sqlEmpty");

  if (sqlSearch && sqlGrid) {
    const sqlCards = Array.from(sqlGrid.querySelectorAll(".sql-card"));
    sqlSearch.addEventListener("input", () => {
      const term = sqlSearch.value.trim().toLowerCase();
      let visible = 0;
      sqlCards.forEach((card) => {
        const matches = !term || (card.dataset.search + " " + card.textContent).toLowerCase().includes(term);
        card.hidden = !matches;
        if (matches) visible++;
      });
      if (sqlResultCount) sqlResultCount.textContent = `${visible} ${visible === 1 ? "query" : "queries"}`;
      if (sqlEmpty) sqlEmpty.hidden = visible !== 0;
    });

    sqlGrid.addEventListener("click", async (event) => {
      const button = event.target.closest(".copy-query");
      if (!button) return;
      const code = button.closest(".sql-card")?.querySelector("pre code")?.textContent;
      if (!code) return;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(code);
        } else {
          const helper = document.createElement("textarea");
          helper.value = code;
          helper.style.position = "fixed";
          helper.style.opacity = "0";
          document.body.appendChild(helper);
          helper.select();
          const copied = document.execCommand("copy");
          helper.remove();
          if (!copied) throw new Error("Clipboard copy was not available");
        }
        const original = button.textContent;
        button.textContent = "Copied ✓";
        button.classList.add("copied");
        window.setTimeout(() => {
          button.textContent = original;
          button.classList.remove("copied");
        }, 1400);
      } catch (error) {
        console.error("Could not copy SQL query:", error);
        button.textContent = "Select query above";
        window.setTimeout(() => { button.textContent = "Copy query"; }, 1600);
      }
    });
  }

})();
