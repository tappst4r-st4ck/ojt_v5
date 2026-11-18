    // --------------------------------------------------------
    // APPLICATION STATE
    // --------------------------------------------------------
    let currentUserRole = null;
    let currentUser = null;
    let currentView = 'schedule';
    let selectedTrainerForModal = null;
    let currentFacultyFilter = 'all';
    let dashboardTrainerLinks = []; // rows of the dashboard workload table, for "View schedule"
    let highlightedTrainer = ''; // normalized trainer name highlighted in the Master Schedule
    let scheduleEntries = [];
    let editingScheduleId = null;
    let googleIdentityInitialized = false;
    let rolePreviewActive = false;
    let rolePreviewEnabled = false;

    // --------------------------------------------------------
    let facultyDatabase = [];
    let curriculumDiplomas = [];
    let curriculumSections = [];

    // --------------------------------------------------------
    // TOAST SYSTEM
    // --------------------------------------------------------
    function showToast(msg) {
      const toast = document.getElementById('toastNotification');
      const text = document.getElementById('toastMessage');
      text.innerText = msg;
      toast.classList.remove('translate-y-20', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
      setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
      }, 2800);
    }

    async function apiRequest(url, options = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      if (rolePreviewActive && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        throw new Error('Role preview is read-only. Sign in with Google to save changes.');
      }
      const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Request failed with status ${response.status}.`);
      }
      return result;
    }

    function makeFacultyRecord(record, schedule) {
      const fullName = `${record.firstName} ${record.mi || ''} ${record.lastName}`.replace(/\s+/g, ' ').trim();
      const assignedCourses = new Map();
      for (const entry of schedule.filter(item => item.assignedTrainer === fullName)) {
        const key = `${entry.courseCode}|${entry.courseName}`;
        assignedCourses.set(key, {
          code: entry.courseCode,
          name: entry.courseName,
          lec: Number(entry.lectureUnits || 0),
          lab: Number(entry.labUnits || 0),
          total: Number(entry.lectureUnits || 0) + Number(entry.labUnits || 0)
        });
      }
      return {
        ...record,
        dept: String(record.department || '').split('/')[0].trim(),
        quals: record.qualifications || '',
        mobile: record.mobileNumber || '',
        sharedGroup: String(record.department || '').includes('/') ? record.department : '',
        isShared: String(record.department || '').includes('/'),
        courses: [...assignedCourses.values()]
      };
    }

    function applyDashboardData(data) {
      const selectedDiploma = document.getElementById('schedDiplomaFilter').value;
      const selectedSemester = document.getElementById('schedSemFilter').value;
      const selectedYear = document.getElementById('schedYearFilter').value;
      const selectedSchoolYear = document.getElementById('schedSchoolYearFilter')?.value;

      facultyDatabase = data.faculty.map(record => makeFacultyRecord(record, data.schedule));
      curriculumDiplomas = data.diplomas.map(record => ({
        id: record.id,
        code: record.code,
        title: record.name,
        durationYears: Number(record.durationYears) || 3
      }));
      scheduleEntries = data.schedule;
      const grouped = new Map();
      for (const record of data.courses) {
        const key = `${record.diplomaCode}|${record.diplomaYear}|${record.semester}`;
        if (!grouped.has(key)) {
          const diploma = curriculumDiplomas.find(item => item.code === record.diplomaCode);
          const year = String(record.diplomaYear || '');
          const semester = String(record.semester || '');
          const yearNames = { '1': 'First', '2': 'Second', '3': 'Third' };
          const semesterNames = { '1': 'First', '2': 'Second' };
          grouped.set(key, {
            id: key,
            diploma: record.diplomaCode,
            diplomaTitle: `${record.diplomaCode} - ${diploma?.title || record.diplomaName}`,
            yearLevel: year,
            semester,
            yearRevision: `${yearNames[year] ? `${yearNames[year]} Year` : `Year ${year}`} · ${semesterNames[semester] ? `${semesterNames[semester]} Semester` : `Semester ${semester}`}`,
            courses: []
          });
        }
        grouped.get(key).courses.push({
          id: record.id,
          code: record.code,
          name: record.name,
          lec: Number(record.lecUnits || 0),
          lab: Number(record.labUnits || 0),
          total: Number(record.totalUnits || 0),
          prereq: record.prerequisites || '',
          qual: record.qualification || '',
        });
      }
      curriculumSections = [...grouped.values()];

      const diplomaSelect = document.getElementById('schedDiplomaFilter');
      const previousDiploma = curriculumDiplomas.some(item => item.code === selectedDiploma)
        ? selectedDiploma
        : (curriculumDiplomas[0]?.code || '');
      diplomaSelect.innerHTML = curriculumDiplomas.map(item =>
        `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} - ${escapeHtml(item.title)}</option>`
      ).join('');
      diplomaSelect.value = previousDiploma;
      if (selectedSemester) document.getElementById('schedSemFilter').value = selectedSemester;
      if (selectedYear) document.getElementById('schedYearFilter').value = selectedYear;
      if (selectedSchoolYear) document.getElementById('schedSchoolYearFilter').value = selectedSchoolYear;
      updateScheduleYearOptions();

      renderFacultyFilters();
      renderTimetable();
      renderFacultyTable(getVisibleFaculty());
      renderCurriculumSections();

      // Initialize dashboard filters with current values
      if (selectedSchoolYear) document.getElementById('dashSchoolYearFilter').value = selectedSchoolYear;
      if (selectedDiploma) document.getElementById('dashDiplomaFilter').value = selectedDiploma;
      if (selectedYear) document.getElementById('dashYearFilter').value = selectedYear;
      if (selectedSemester) document.getElementById('dashSemFilter').value = selectedSemester;

      // Render dashboard if it's the current view
      if (currentView === 'dashboard') {
        renderDashboard();
      }

      updateRolePermissions();
    }

    function renderFacultyFilters() {
      const container = document.querySelector('.faculty-chip')?.parentElement;
      if (!container) return;
      const departments = [...new Set(facultyDatabase.flatMap(faculty =>
        `${faculty.dept || ''} ${faculty.sharedGroup || ''}`
          .split('/')
          .map(value => value.trim())
          .filter(Boolean)
      ))].sort();
      const filters = [
        { value: 'all', label: `All (${facultyDatabase.length})` },
        { value: 'shared', label: `★ Shared Faculty (${facultyDatabase.filter(item => item.isShared).length})` },
        ...departments.map(department => ({ value: department, label: department }))
      ];
      if (!filters.some(filter => filter.value === currentFacultyFilter)) currentFacultyFilter = 'all';
      container.querySelectorAll('.faculty-chip').forEach(chip => chip.remove());
      for (const filter of filters) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.dept = filter.value;
        button.textContent = filter.label;
        button.className = filter.value === currentFacultyFilter
          ? 'faculty-chip shrink-0 px-3 py-1 rounded-full border border-blue-900 bg-blue-900 text-white text-xs font-semibold transition'
          : 'faculty-chip shrink-0 px-3 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-900 text-xs font-medium transition';
        button.addEventListener('click', () => filterFaculty(filter.value));
        container.appendChild(button);
      }
    }

    async function refreshDashboardData() {
      const data = await apiRequest('/api/data');
      applyDashboardData(data);
      setAuthenticatedUser(data.user);
      const status = document.getElementById('googleConnectionStatus');
      status.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>Connected';
      status.className = 'inline-flex items-center gap-1.5 text-emerald-700 font-semibold';
      return data;
    }

    function setAuthenticatedUser(user) {
      currentUser = user;
      currentUserRole = user?.isHeadTrainer ? 'head' : (user ? 'trainee' : null);
      const avatar = document.getElementById('sidebarUserAvatar');
      const name = document.getElementById('sidebarUserName');
      const roleBadge = document.getElementById('sidebarUserRoleBadge');
      const authButton = document.getElementById('sidebarAuthButton');
      const authIcon = document.getElementById('sidebarAuthIcon');
      const authLabel = document.getElementById('sidebarAuthLabel');

      if (!user) {
        avatar.innerText = 'PV';
        avatar.className = 'w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600';
        name.innerText = 'Public Viewer';
        roleBadge.innerText = 'Read-only';
        roleBadge.className = 'inline-block mt-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 rounded';
        authButton.title = 'Sign in with Google';
        authIcon.innerText = 'login';
        authLabel.innerText = 'Sign in';
      } else {
        avatar.innerText = String(user.name || user.email).split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
        avatar.className = `w-8 h-8 rounded-lg ${user.isHeadTrainer ? 'bg-blue-900' : 'bg-amber-600'} flex items-center justify-center text-xs font-bold text-white`;
        name.innerText = user.name || user.email;
        roleBadge.innerText = user.role || 'Faculty';
        roleBadge.className = `inline-block mt-0.5 text-[11px] font-semibold ${user.isHeadTrainer ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-amber-50 text-amber-800 border-amber-200'} border px-1.5 rounded`;
        authButton.title = 'Sign out';
        authIcon.innerText = 'logout';
        authLabel.innerText = 'Sign Out';
      }
      updateRolePermissions();
      if (currentView === 'schedule') renderTimetable();
      if (currentView === 'faculty') renderFacultyTable(getVisibleFaculty());
      if (currentView === 'curriculum') renderCurriculumSections();
    }

    function handleGoogleCredential(response) {
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ credential: response.credential })
      }).then(async result => {
        rolePreviewActive = false;
        setAuthenticatedUser(result.user);
        await refreshDashboardData();
        document.getElementById('authMessage').classList.add('hidden');
        showToast(result.user.isHeadTrainer ? 'Signed in with Head Trainer access.' : 'Signed in with read-only access.');
        switchView('schedule');
      }).catch(error => {
        const message = document.getElementById('authMessage');
        message.textContent = error.message;
        message.classList.remove('hidden');
      });
    }

    async function initializeGoogleIdentity() {
      try {
        const { googleClientId, rolePreviewEnabled: previewEnabled } = await apiRequest('/api/auth/config');
        rolePreviewEnabled = previewEnabled;
        document.getElementById('rolePreviewControls').classList.toggle('hidden', !rolePreviewEnabled);
        if (!googleClientId) {
          throw new Error('Google sign-in is not configured on the server.');
        }
        const initialize = () => {
          if (!window.google?.accounts?.id || googleIdentityInitialized) return;
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredential,
            auto_select: false
          });
          window.google.accounts.id.renderButton(
            document.getElementById('googleIdentityButton'),
            { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 280 }
          );
          googleIdentityInitialized = true;
        };
        if (window.google?.accounts?.id) {
          initialize();
        } else {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.defer = true;
          script.onload = initialize;
          script.onerror = () => {
            document.getElementById('authMessage').textContent = 'Google sign-in could not be loaded.';
            document.getElementById('authMessage').classList.remove('hidden');
          };
          document.head.appendChild(script);
        }
      } catch (error) {
        const message = document.getElementById('authMessage');
        message.textContent = error.message;
        message.classList.remove('hidden');
      }
    }

    async function startRolePreview(role) {
      if (!['head', 'trainee'].includes(role)) return;
      rolePreviewActive = true;
      document.getElementById('authMessage').classList.add('hidden');
      try {
        const data = await apiRequest('/api/data');
        applyDashboardData(data);
      } catch (error) {
        showToast(`Preview data unavailable: ${error.message}`);
      }
      const isHeadTrainer = role === 'head';
      setAuthenticatedUser({
        name: isHeadTrainer ? 'Head Trainer Preview' : 'Trainee Preview',
        email: '',
        role: isHeadTrainer ? 'Head Trainer Preview' : 'Trainee Preview',
        isHeadTrainer,
      });
      switchView('schedule');
      showToast('Role preview only. Changes are not saved.');
    }

    async function handleSidebarAuthAction() {
      if (rolePreviewActive) {
        rolePreviewActive = false;
        setAuthenticatedUser(null);
        switchView('login');
        return;
      }
      if (!currentUser) {
        initializeGoogleIdentity();
        switchView('login');
        return;
      }
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
        setAuthenticatedUser(null);
        await refreshDashboardData();
        showToast('Signed out. The dashboard remains available in read-only mode.');
      } catch (error) {
        showToast(error.message);
      }
    }

    // --------------------------------------------------------
    // VIEW NAVIGATION LOGIC
    // --------------------------------------------------------
    function switchView(target) {
      currentView = target;
  const views = ['login', 'dashboard', 'schedule', 'faculty', 'curriculum'];
  const sidebar = document.getElementById('appSidebar');
  const content = document.getElementById('contentArea');
  sidebar.classList.toggle('hidden', target === 'login');
  content.classList.toggle('login-active', target === 'login');
  content.classList.toggle('flex', target === 'login');
  content.classList.toggle('justify-center', target === 'login');
  content.scrollTop = 0; // every view opens at the top, not where the previous one was scrolled

  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const navBtn = document.getElementById(`sidebar-nav-${v}`);

    if (el) {
      if (v === target) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }

    if (navBtn) {
      const icon = navBtn.querySelector('.material-symbols-outlined');
      if (v === target) {
        navBtn.className = "shrink-0 md:w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold text-blue-900 bg-blue-50 ring-1 ring-inset ring-blue-100 transition text-left whitespace-nowrap";
        if (icon) icon.className = "material-symbols-outlined text-blue-600";
      } else {
        navBtn.className = "shrink-0 md:w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition text-left whitespace-nowrap";
        if (icon) icon.className = "material-symbols-outlined text-slate-500";
      }
    }
  });

  if (target === 'dashboard') {
    renderDashboard();
  } else if (target === 'schedule') {
        renderTimetable();
      } else if (target === 'faculty') {
        renderFacultyTable(getVisibleFaculty());
      } else if (target === 'curriculum') {
        renderCurriculumSections();
      }

      updateRolePermissions();
    }

    function handleQuickAddAction() {
      if (currentUserRole !== 'head' || currentView !== 'schedule') return;
      openScheduleModal(null, 'Monday', '10:00 AM - 11:30 AM');
    }

    function updateRolePermissions() {
      const isHeadTrainer = currentUserRole === 'head';
      document.getElementById('facultyAddButton').classList.toggle('hidden', !isHeadTrainer);
      document.getElementById('curriculumAddButton').classList.toggle('hidden', !isHeadTrainer);
      document.getElementById('importSheetButton').classList.toggle('hidden', !isHeadTrainer);
      document.getElementById('driveUploadButton').classList.toggle('hidden', !isHeadTrainer);
      document.getElementById('pdfExportButton').classList.toggle('hidden', !isHeadTrainer);
      document.getElementById('quickActionButton').classList.toggle('hidden', !isHeadTrainer);
      document.getElementById('facultyLoadingReportButton').classList.toggle('hidden', !isHeadTrainer);

      if (!isHeadTrainer) {
        document.getElementById('facultyFormModal').classList.add('hidden');
        document.getElementById('addCurriculumModal').classList.add('hidden');
      }

      if (currentView === 'faculty') {
        renderFacultyTable(getVisibleFaculty());
      }
    }

    function printFacultyLoadingReport() {
      if (currentUserRole !== 'head') {
        showToast('Only the Head Trainer can generate the Faculty Loading Report.');
        return;
      }

      const diplomaCode = document.getElementById('schedDiplomaFilter').value;
      const diploma = curriculumDiplomas.find(item => item.code === diplomaCode);
      const diplomaYear = document.getElementById('schedYearFilter').value;
      const semester = document.getElementById('schedSemFilter').value;
      const schoolYear = document.getElementById('schedSchoolYearFilter').value;
      const selectedSchedule = scheduleEntries.filter(record =>
        record.diplomaCode === diplomaCode &&
        String(record.diplomaYear) === String(diplomaYear) &&
        String(record.semester) === String(semester) &&
        String(record.schoolYear) === String(schoolYear)
      );

      if (selectedSchedule.length === 0) {
        showToast('No scheduled course rows match the selected filters.');
        return;
      }

      const normalizeName = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const dayOrder = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4 };
      const dayLabel = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri' };
      const timeValue = value => {
        const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return Number.MAX_SAFE_INTEGER;
        const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
        return hour * 60 + Number(match[2]);
      };
      const rows = selectedSchedule.map(record => {
        const trainerKey = normalizeName(record.assignedTrainer);
        const faculty = facultyDatabase.find(person =>
          normalizeName(`${person.firstName} ${person.mi || ''} ${person.lastName}`) === trainerKey
        );
        const lectureUnits = Number(record.lectureUnits || 0);
        const labUnits = Number(record.labUnits || 0);
        return {
          facultyKey: faculty?.id || trainerKey || 'unassigned',
          facultyName: faculty
            ? `${faculty.firstName} ${faculty.mi || ''} ${faculty.lastName}`.replace(/\s+/g, ' ').trim()
            : (record.assignedTrainer || 'Unassigned'),
          role: faculty?.role || 'Unlisted',
          department: faculty?.department || 'Unlisted',
          courseCode: record.courseCode || '',
          courseName: record.courseName || '',
          type: lectureUnits && labUnits ? 'Lec-Lab' : (lectureUnits ? 'Lec' : 'Lab'),
          lectureUnits,
          labUnits,
          totalUnits: lectureUnits + labUnits / 3,
          contactHours: lectureUnits + labUnits * 1.5,
          day: record.day || '',
          timeSlot: record.scheduledTime || '',
        };
      }).sort((left, right) =>
        left.facultyName.localeCompare(right.facultyName, undefined, { sensitivity: 'base' }) ||
        (dayOrder[String(left.day).toLowerCase()] ?? 99) - (dayOrder[String(right.day).toLowerCase()] ?? 99) ||
        timeValue(left.timeSlot) - timeValue(right.timeSlot) ||
        left.timeSlot.localeCompare(right.timeSlot)
      );

      const facultyGroups = new Map();
      for (const row of rows) {
        if (!facultyGroups.has(row.facultyKey)) facultyGroups.set(row.facultyKey, []);
        facultyGroups.get(row.facultyKey).push(row);
      }

      let rowNumber = 0;
      const tableRows = [];
      let grandUnits = 0;
      let grandContactHours = 0;
      for (const groupRows of facultyGroups.values()) {
        let facultyUnits = 0;
        let facultyContactHours = 0;
        for (const row of groupRows) {
          rowNumber++;
          facultyUnits += row.totalUnits;
          facultyContactHours += row.contactHours;
          tableRows.push(`<tr>
            <td>${rowNumber}</td>
            <td>${escapeHtml(row.facultyName)}</td>
            <td>${escapeHtml(row.role)}</td>
            <td>${escapeHtml(row.department)}</td>
            <td>${escapeHtml(row.courseCode)}</td>
            <td class="course-name">${escapeHtml(row.courseName)}</td>
            <td>${row.type}</td>
            <td>${row.lectureUnits}</td>
            <td>${row.labUnits}</td>
            <td>${row.totalUnits.toFixed(2)}</td>
            <td>${row.contactHours.toFixed(1)}</td>
            <td>${escapeHtml(dayLabel[String(row.day).toLowerCase()] || row.day)}</td>
            <td>${escapeHtml(row.timeSlot)}</td>
          </tr>`);
        }
        grandUnits += facultyUnits;
        grandContactHours += facultyContactHours;
        tableRows.push(`<tr class="subtotal">
          <td colspan="9">Subtotal — ${escapeHtml(groupRows[0].facultyName)}</td>
          <td>${facultyUnits.toFixed(2)}</td>
          <td>${facultyContactHours.toFixed(1)}</td>
          <td colspan="2"></td>
        </tr>`);
      }
      tableRows.push(`<tr class="grand-total">
        <td colspan="9">Grand Totals</td>
        <td>${grandUnits.toFixed(2)}</td>
        <td>${grandContactHours.toFixed(1)}</td>
        <td colspan="2"></td>
      </tr>`);

      const generated = new Intl.DateTimeFormat('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric'
      }).format(new Date());
      const preparedBy = currentUser?.name || 'Head Trainer Preview';
      const logoUrl = new URL('/tesda%20logo.jpg', window.location.href).href;
      const reportTitle = `Faculty Loading Report - ${diplomaCode} Y${diplomaYear} S${semester} ${schoolYear}`;

      const columns = [
        '#', 'Faculty Name', 'Role', 'Dept', 'Course Code', 'Course Name', 'Type',
        'Lec Units', 'Lab Units', 'Total Units', 'Contact Hrs <br>(Lec×1.0 + Lab×1.5)', 'Day', 'Time Slot'
      ];
      const reportHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(reportTitle)}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 8mm 8mm 12mm;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      color: #333;
      font: 7pt Arial, sans-serif;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font: 8pt Arial, sans-serif; }
  .report-header { display: grid; grid-template-columns: 19mm 1fr; align-items: center; gap: 4mm; border-bottom: 1.2pt solid #243b5a; padding-bottom: 3mm; }
  .logo { width: 18mm; height: 18mm; object-fit: contain; }
  .title-block { text-align: center; }
  .region { margin: 0 0 1mm; color: #253f67; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
  h1 { margin: 0; font-size: 15pt; line-height: 1.1; }
  .filters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5mm 3mm; margin: 3mm 0 1.5mm; padding: 2mm; border: .6pt solid #555; }
  .filter { white-space: nowrap; }
  .generated { display: flex; justify-content: space-between; gap: 3mm; margin-bottom: 2.5mm; font-size: 7pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7pt; }
  th, td { border: .45pt solid #333; padding: 1.2mm .8mm; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
  th { background: #e8ebef; font-weight: 700; }
  td.course-name { text-align: left; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  .subtotal td { background: #f1f1f1; font-weight: 700; }
  .grand-total td { background: #dfe4ea; font-weight: 700; border-top: 1.2pt solid #111; }
  .report-summary { margin-top: 2.5mm; padding: 2mm; border: .8pt solid #333; font-size: 7pt; font-weight: 700; text-align: center; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; margin-top: 10mm; text-align: center; font-size: 7pt; }
  .signature-line { display: block; height: 8mm; margin-bottom: 1.5mm; border-bottom: .6pt solid #222; }
  @media screen { body { padding: 8mm; background: #fff; } .report { max-width: 281mm; margin: 0 auto; } }
</style>
</head>
<body>
<main class="report">
  <header class="report-header">
    <img class="logo" src="${escapeHtml(logoUrl)}" alt="TESDA Region XI seal">
    <div class="title-block">
      <p class="region">TESDA Region XI</p>
      <h1>FACULTY LOADING REPORT</h1>
    </div>
  </header>
  <section class="filters" aria-label="Report filters">
    <div class="filter"><strong>Diploma:</strong> ${escapeHtml(diplomaCode)}${diploma ? ` — ${escapeHtml(diploma.title)}` : ''}</div>
    <div class="filter"><strong>Year:</strong> ${escapeHtml(diplomaYear)}</div>
    <div class="filter"><strong>Semester:</strong> ${escapeHtml(semester)}</div>
    <div class="filter"><strong>SY:</strong> ${escapeHtml(schoolYear.replace(/^SY\s*/i, ''))}</div>
  </section>
  <div class="generated">
    <span><strong>Generated:</strong> ${escapeHtml(generated)}</span>
    <span><strong>Prepared by:</strong> ${escapeHtml(preparedBy)}</span>
  </div>
  <table>
    <colgroup><col style="width:3%"><col style="width:10%"><col style="width:7%"><col style="width:6%"><col style="width:7%"><col style="width:15%"><col style="width:6%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:9%"><col style="width:5%"><col style="width:12%"></colgroup>
    <thead><tr>${columns.map(column => `<th scope="col">${column}</th>`).join('')}</tr></thead>
    <tbody>${tableRows.join('')}</tbody>
  </table>
  <div class="report-summary">Total Faculty: ${facultyGroups.size} | Total Courses: ${rows.length} | Total Units: ${grandUnits.toFixed(2)} | Total Contact Hrs: ${grandContactHours.toFixed(1)}</div>
  <footer class="signatures">
    <div><span class="signature-line"></span>Prepared by</div>
    <div><span class="signature-line"></span>Noted by</div>
    <div><span class="signature-line"></span>Approved by</div>
  </footer>
</main>
</body>
</html>`;

      printReport(reportHtml, reportTitle, 'Choose "Save as PDF" as the destination to download the landscape report.');
    }

    // Print from a hidden in-page iframe (no pop-up). The browser's print dialog
    // offers "Save as PDF"; a one-click .pdf download would need a PDF library + CSP change.
    function printReport(reportHtml, reportTitle, hint) {
      document.getElementById('reportPrintFrame')?.remove();
      const frame = document.createElement('iframe');
      frame.id = 'reportPrintFrame';
      frame.title = reportTitle;
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      frame.addEventListener('load', () => {
        const appTitle = document.title;
        document.title = reportTitle; // used as the default PDF file name
        frame.contentWindow.addEventListener('afterprint', () => {
          document.title = appTitle;
          frame.remove();
        }, { once: true });
        frame.contentWindow.focus();
        frame.contentWindow.print();
      }, { once: true });
      frame.srcdoc = reportHtml;
      if (hint) showToast(hint);
      document.body.appendChild(frame);
    }

    // Curriculum report for the diploma/year picked in the Print dialog.
    function printCurriculumReport() {
      const diplomaFilter = document.getElementById('pdfDiplomaSelect').value;
      const yearFilter = document.getElementById('pdfYearSelect').value;
      const sections = curriculumSections
        .filter(section => (diplomaFilter === 'ALL' || section.diploma === diplomaFilter) &&
          (yearFilter === 'ALL' || section.yearLevel === yearFilter))
        .sort((a, b) => a.diploma.localeCompare(b.diploma) ||
          Number(a.yearLevel) - Number(b.yearLevel) || Number(a.semester) - Number(b.semester));
      if (sections.length === 0) {
        showToast('No curriculum courses match the selected diploma and year level.');
        return;
      }

      const byDiploma = new Map();
      for (const section of sections) {
        if (!byDiploma.has(section.diploma)) byDiploma.set(section.diploma, []);
        byDiploma.get(section.diploma).push(section);
      }
      const unitsOf = courses => courses.reduce((sum, course) => sum + course.total, 0);
      const diplomaPages = [...byDiploma.values()].map(diplomaSections => {
        const courses = diplomaSections.flatMap(section => section.courses);
        return `<section class="diploma">
  <h2>${escapeHtml(diplomaSections[0].diplomaTitle)}</h2>
  <table>
    <colgroup><col style="width:13%"><col style="width:31%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:13%"><col style="width:18%"></colgroup>
    <thead><tr><th>Course Code</th><th>Course Name</th><th>Lec</th><th>Lab</th><th>Total Units</th><th>Pre-requisites</th><th>Resultant Qualification</th></tr></thead>
    ${diplomaSections.map(section => `<tbody>
      <tr class="term"><td colspan="7">${escapeHtml(section.yearRevision)}</td></tr>
      ${section.courses.map(course => `<tr>
        <td>${escapeHtml(course.code)}</td><td class="left">${escapeHtml(course.name)}</td>
        <td>${course.lec}</td><td>${course.lab}</td><td>${course.total}</td>
        <td>${escapeHtml(course.prereq)}</td><td class="left">${escapeHtml(course.qual)}</td>
      </tr>`).join('')}
      <tr class="subtotal"><td colspan="4">Subtotal</td><td>${unitsOf(section.courses)}</td><td colspan="2"></td></tr>
    </tbody>`).join('')}
    <tbody><tr class="grand-total"><td colspan="4">Total — ${courses.length} courses</td><td>${unitsOf(courses)}</td><td colspan="2"></td></tr></tbody>
  </table>
</section>`;
      });

      const scope = diplomaFilter === 'ALL' ? 'All Diplomas' : diplomaFilter;
      const reportTitle = `Curriculum - ${scope}${yearFilter === 'ALL' ? '' : ` Year ${yearFilter}`}`;
      const generated = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
      const logoUrl = new URL('/tesda%20logo.jpg', window.location.href).href;
      const reportHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(reportTitle)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 10mm 14mm;
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt Arial, sans-serif; color: #333; } }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font: 8.5pt Arial, sans-serif; }
  .report-header { display: grid; grid-template-columns: 19mm 1fr; align-items: center; gap: 4mm; border-bottom: 1.2pt solid #243b5a; padding-bottom: 3mm; margin-bottom: 3mm; }
  .logo { width: 18mm; height: 18mm; object-fit: contain; }
  .title-block { text-align: center; }
  .region { margin: 0 0 1mm; color: #253f67; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
  h1 { margin: 0; font-size: 15pt; }
  .generated { margin: 0 0 3mm; font-size: 7.5pt; text-align: right; }
  .diploma + .diploma { break-before: page; }
  h2 { margin: 0 0 2mm; font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: .45pt solid #333; padding: 1.4mm 1mm; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
  th { background: #e8ebef; }
  td.left { text-align: left; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .term td { background: #f4f6f8; font-weight: 700; text-align: left; }
  .subtotal td { background: #f1f1f1; font-weight: 700; }
  .grand-total td { background: #dfe4ea; font-weight: 700; border-top: 1.2pt solid #111; }
  @media screen { body { padding: 10mm; } }
</style>
</head>
<body>
  <header class="report-header">
    <img class="logo" src="${escapeHtml(logoUrl)}" alt="TESDA Region XI seal">
    <div class="title-block"><p class="region">TESDA Region XI</p><h1>CURRICULUM REGISTRY</h1></div>
  </header>
  <p class="generated"><strong>Generated:</strong> ${escapeHtml(generated)}</p>
  ${diplomaPages.join('')}
</body>
</html>`;
      closeCurriculumPdfModal();
      printReport(reportHtml, reportTitle);
    }

    function getTimetableCard(diploma, sem, year, day, time) {
      const schoolYear = document.getElementById('schedSchoolYearFilter').value;
      const record = scheduleEntries.find(item =>
        item.diplomaCode === diploma &&
        String(item.semester) === String(sem) &&
        String(item.diplomaYear) === String(year) &&
        item.schoolYear === schoolYear &&
        item.day === day &&
        item.scheduledTime === time
      );
      if (!record) return null;
      const trainer = facultyDatabase.find(person =>
        `${person.firstName} ${person.mi || ''} ${person.lastName}`.replace(/\s+/g, ' ').trim() === record.assignedTrainer
      );
      const lectureUnits = Number(record.lectureUnits || 0);
      const labUnits = Number(record.labUnits || 0);
      const totalUnits = lectureUnits + labUnits;
      const hours = lectureUnits + (labUnits * 1.5);
      const type = lectureUnits && labUnits ? 'Lec/Lab' : (lectureUnits ? 'Lecture' : 'Lab');
      return {
        scheduleRecord: record,
        code: record.courseCode,
        title: record.courseName,
        type,
        trainer: record.assignedTrainer,
        units: `${totalUnits} Units (${lectureUnits}L/${labUnits}L)`,
        hours: `${hours.toFixed(1)} hrs/wk`,
        isShared: Boolean(trainer?.isShared)
      };
    }

    function ensureScheduleModal() {
      if (document.getElementById('scheduleAssignmentModal')) return;
      const modal = document.createElement('div');
      modal.id = 'scheduleAssignmentModal';
      modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4';
      modal.innerHTML = `
        <form class="modal-panel max-w-lg" id="scheduleAssignmentForm">
          <div class="modal-head">
            <div class="min-w-0">
              <h3 class="text-[15px] font-bold text-slate-900" id="scheduleAssignmentTitle">New Timetable Entry</h3>
              <p class="text-xs text-slate-500 tabular-nums" id="scheduleAssignmentSubtitle"></p>
            </div>
            <button class="modal-close" type="button" data-click="closeScheduleModal">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="p-5 space-y-3 text-xs">
            <label class="block text-xs font-semibold text-slate-700">Curriculum Course
              <select class="field mt-1.5" id="scheduleCourseSelect" required></select>
            </label>
            <label class="block text-xs font-semibold text-slate-700">Assigned Trainer
              <select class="field mt-1.5" id="scheduleTrainerSelect" required></select>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block text-xs font-semibold text-slate-700">Day
                <select class="field mt-1.5" id="scheduleDaySelect">
                  <option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option>
                </select>
              </label>
              <label class="block text-xs font-semibold text-slate-700">Scheduled Time
                <select class="field mt-1.5 tabular-nums" id="scheduleTimeSelect">
                  <option>10:00 AM - 11:30 AM</option><option>11:30 AM - 1:00 PM</option><option>1:00 PM - 2:30 PM</option><option>2:30 PM - 4:00 PM</option><option>4:00 PM - 5:00 PM</option>
                </select>
              </label>
            </div>
            <p class="text-xs text-slate-500">Diploma, year, semester, school year, and course units are taken from the selected schedule filters and curriculum.</p>
          </div>
          <div class="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <button class="hidden rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100" id="scheduleDeleteButton" type="button">Remove Assignment</button>
            <div class="ml-auto flex gap-2">
              <button class="btn-ghost" type="button" data-click="closeScheduleModal">Cancel</button>
              <button class="btn-primary" type="submit">Save Assignment</button>
            </div>
          </div>
        </form>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#scheduleAssignmentForm').addEventListener('submit', saveScheduleAssignment);
      modal.querySelector('#scheduleDeleteButton').addEventListener('click', deleteScheduleAssignment);
    }

    function openScheduleModal(courseCard, day, time) {
      if (currentUserRole !== 'head') {
        showToast('Only the Head Trainer can edit timetable assignments.');
        return;
      }
      ensureScheduleModal();
      const diploma = document.getElementById('schedDiplomaFilter').value;
      const year = document.getElementById('schedYearFilter').value;
      const semester = document.getElementById('schedSemFilter').value;
      const courses = curriculumSections
        .filter(section => section.diploma === diploma && section.yearLevel === String(year) && section.semester === String(semester))
        .flatMap(section => section.courses);
      const courseSelect = document.getElementById('scheduleCourseSelect');
      const trainerSelect = document.getElementById('scheduleTrainerSelect');
      const schedule = courseCard?.scheduleRecord || null;
      editingScheduleId = schedule?.id || null;
      courseSelect.innerHTML = courses.map(course =>
        `<option value="${escapeHtml(course.id)}">${escapeHtml(course.code)} - ${escapeHtml(course.name)}</option>`
      ).join('');
      trainerSelect.innerHTML = facultyDatabase.map(faculty => {
        const fullName = `${faculty.firstName} ${faculty.mi || ''} ${faculty.lastName}`.replace(/\s+/g, ' ').trim();
        return `<option value="${escapeHtml(faculty.id)}">${escapeHtml(fullName)}</option>`;
      }).join('');

      if (schedule) {
        courseSelect.value = courses.find(course => course.code === schedule.courseCode)?.id || '';
        const assignedFaculty = facultyDatabase.find(person =>
          `${person.firstName} ${person.mi || ''} ${person.lastName}`.replace(/\s+/g, ' ').trim() === schedule.assignedTrainer
        );
        if (assignedFaculty) trainerSelect.value = assignedFaculty.id;
      } else {
        const preferredCourse = courses.find(course => !scheduleEntries.some(item =>
          item.diplomaCode === diploma &&
          String(item.diplomaYear) === String(year) &&
          String(item.semester) === String(semester) &&
          item.courseCode === course.code
        ));
        if (preferredCourse) courseSelect.value = preferredCourse.id;
      }

      const modal = document.getElementById('scheduleAssignmentModal');
      const deleteButton = document.getElementById('scheduleDeleteButton');
      document.getElementById('scheduleAssignmentTitle').textContent = schedule ? 'Edit Timetable Entry' : 'New Timetable Entry';
      document.getElementById('scheduleAssignmentSubtitle').textContent = `${diploma} - Year ${year}, Semester ${semester}`;
      document.getElementById('scheduleDaySelect').value = schedule?.day || day;
      document.getElementById('scheduleTimeSelect').value = schedule?.scheduledTime || time;
      deleteButton.classList.toggle('hidden', !schedule);
      courseSelect.disabled = courses.length === 0;
      trainerSelect.disabled = facultyDatabase.length === 0;
      if (courses.length === 0 || facultyDatabase.length === 0) {
        showToast('Add a curriculum course and a faculty record before assigning this timetable slot.');
        return;
      }
      modal.classList.remove('hidden');
    }

    function closeScheduleModal() {
      document.getElementById('scheduleAssignmentModal')?.classList.add('hidden');
      editingScheduleId = null;
    }

    async function saveScheduleAssignment(event) {
      event.preventDefault();
      if (currentUserRole !== 'head') return;
      const courseId = document.getElementById('scheduleCourseSelect').value;
      const course = curriculumSections.flatMap(section => section.courses).find(item => item.id === courseId);
      const trainer = facultyDatabase.find(item => String(item.id) === document.getElementById('scheduleTrainerSelect').value);
      if (!course || !trainer) {
        showToast('Select a valid curriculum course and trainer.');
        return;
      }
      const diplomaCode = document.getElementById('schedDiplomaFilter').value;
      const diploma = curriculumDiplomas.find(item => item.code === diplomaCode);
      const record = {
        id: editingScheduleId || crypto.randomUUID(),
        diplomaCode,
        diplomaName: diploma?.title || diplomaCode,
        diplomaYear: Number(document.getElementById('schedYearFilter').value),
        semester: Number(document.getElementById('schedSemFilter').value),
        schoolYear: document.getElementById('schedSchoolYearFilter').value,
        day: document.getElementById('scheduleDaySelect').value,
        scheduledTime: document.getElementById('scheduleTimeSelect').value,
        courseCode: course.code,
        courseName: course.name,
        assignedTrainer: `${trainer.firstName} ${trainer.mi || ''} ${trainer.lastName}`.replace(/\s+/g, ' ').trim(),
        lectureUnits: Number(course.lec || 0),
        labUnits: Number(course.lab || 0)
      };
      try {
        const path = `/api/records/${encodeURIComponent('Master Schedule')}`;
        await apiRequest(editingScheduleId ? `${path}/${encodeURIComponent(editingScheduleId)}` : path, {
          method: editingScheduleId ? 'PUT' : 'POST',
          body: JSON.stringify(record)
        });
        closeScheduleModal();
        await refreshDashboardData();
        showToast(`Timetable assignment for ${record.courseCode} saved.`);
      } catch (error) {
        showToast(error.message);
      }
    }

    async function deleteScheduleAssignment() {
      if (!editingScheduleId || currentUserRole !== 'head') return;
      try {
        await apiRequest(`/api/records/${encodeURIComponent('Master Schedule')}/${encodeURIComponent(editingScheduleId)}`, { method: 'DELETE' });
        closeScheduleModal();
        await refreshDashboardData();
        showToast('Timetable assignment removed.');
      } catch (error) {
        showToast(error.message);
      }
    }

    // --------------------------------------------------------
    // 3. MASTER SCHEDULE TIMETABLE LOGIC
    // --------------------------------------------------------
    function renderTimetable() {
      const diploma = document.getElementById('schedDiplomaFilter').value;
      updateScheduleYearOptions();
      const sem = document.getElementById('schedSemFilter').value;
      const year = document.getElementById('schedYearFilter').value;

      document.getElementById('currentTimetableHeading').innerText =
        `${diploma} - Year ${year}, Semester ${sem} Master Schedule Matrix`;
      document.getElementById('trainerHighlightChip').classList.toggle('hidden', !highlightedTrainer);

      const tbody = document.getElementById('timetableBody');
      tbody.innerHTML = '';

      // Required Time Slots
      const timeSlots = [
        { time: "8:00 AM - 9:00 AM", isBlocked: true },
        { time: "9:00 AM - 10:00 AM", isBlocked: true },
        { time: "10:00 AM - 11:30 AM", slotKey: "morning" },
        { time: "11:30 AM - 1:00 PM", slotKey: "midday" },
        { time: "1:00 PM - 2:30 PM", slotKey: "afternoon1" },
        { time: "2:30 PM - 4:00 PM", slotKey: "afternoon2" },
        { time: "4:00 PM - 5:00 PM", slotKey: "late" }
      ];

      timeSlots.forEach(slot => {
        const tr = document.createElement('tr');
        tr.className = "transition";

        // Time Column
        const tdTime = document.createElement('td');
        tdTime.className = "sticky left-0 z-[5] py-3 px-3 text-[11px] font-semibold text-slate-600 bg-slate-50 border-r border-b border-slate-200 text-center whitespace-nowrap tabular-nums";
        tdTime.innerText = slot.time;
        tr.appendChild(tdTime);

        // Strict 8:00 AM - 10:00 AM Locked Staff Meeting
        if (slot.isBlocked) {
          const tdBlocked = document.createElement('td');
          tdBlocked.colSpan = 5;
          tdBlocked.className = "py-3 px-4 blocked-stripes border-b border-slate-200 text-center";
          tdBlocked.innerHTML = `
            <div class="flex flex-wrap items-center justify-center gap-2 text-slate-600 font-semibold text-xs">
              <span class="material-symbols-outlined text-slate-500 text-base">lock</span>
              <span>Blocked - Staff Meeting (Mandatory administrative period - no classes permitted)</span>
              <span class="pill bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 uppercase tracking-wider !text-[11px]">Reserved</span>
            </div>
          `;
          tr.appendChild(tdBlocked);
        } else {
          // Mon - Fri Course Mapping
          const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
          days.forEach(day => {
            const td = document.createElement('td');
            td.className = "py-2 px-2 border-r border-b border-slate-100 align-top text-xs transition-colors";
            td.dataset.day = day;
            td.dataset.time = slot.time;

            const course = getTimetableCard(diploma, sem, year, day, slot.time);
            if (course) {
              const highlight = !highlightedTrainer ? ''
                : normalizeName(course.trainer) === highlightedTrainer ? 'ring-2 ring-blue-500' : 'opacity-40';
              td.innerHTML = `
                <div class="rounded-lg border border-slate-200 border-l-[3px] border-l-blue-600 bg-white p-2.5 shadow-sm transition hover:border-slate-300 hover:border-l-blue-800 hover:shadow-md ${highlight}" draggable="true" data-schedule-id="${escapeHtml(course.scheduleRecord.id)}" data-day="${escapeHtml(day)}" data-time="${escapeHtml(slot.time)}">
                  <div class="flex items-center justify-between gap-1">
                    <span class="font-semibold text-blue-900 text-xs tabular-nums">${escapeHtml(course.code)}</span>
                    <span class="rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">${course.type}</span>
                  </div>
                  <div class="text-xs font-semibold text-slate-800 mt-1 leading-snug line-clamp-2">${escapeHtml(course.title)}</div>
                  <div class="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1">
                    <button data-schedule-trainer="${escapeHtml(course.trainer)}" class="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline text-left flex items-center gap-1 min-w-0 group">
                      <span class="material-symbols-outlined text-[14px] text-blue-500 group-hover:scale-110 transition">person</span>
                      <span class="truncate max-w-[110px]">${escapeHtml(course.trainer)}</span>
                    </button>
                    ${course.isShared ? '<span class="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200" title="Multi-department shared trainer">Shared</span>' : ''}
                  </div>
                  <div class="text-[11px] text-slate-500 mt-1 font-medium tabular-nums">
                    ${course.units} | ${course.hours}
                  </div>
                </div>
              `;
              const card = td.querySelector('[data-schedule-id]');
              card.addEventListener('dragstart', handleDragStart);
              card.addEventListener('dragend', handleDragEnd);
            } else {
              td.innerHTML = `<span class="text-[11px] text-slate-500 block text-center py-4">${currentUserRole === 'head' ? '+ Click to assign' : '- Open -'}</span>`;
            }
            if (currentUserRole === 'head') {
              td.classList.add('cursor-pointer', 'hover:bg-blue-50/50');
              td.addEventListener('click', event => {
                if (event.target.closest('[data-schedule-trainer]')) return;
                openScheduleModal(course, day, slot.time);
              });
              td.addEventListener('dragover', handleDragOver);
              td.addEventListener('dragleave', handleDragLeave);
              td.addEventListener('drop', handleDrop);
            }
            tr.appendChild(td);
          });
        }

        tbody.appendChild(tr);
      });
      tbody.querySelectorAll('[data-schedule-trainer]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          openTrainerModalByName(button.dataset.scheduleTrainer);
        });
      });
    }

    // --------------------------------------------------------
    // DRAG & DROP HANDLERS (HEAD TRAINER ONLY)
    // --------------------------------------------------------
    let draggedCard = null;

    function handleDragStart(event) {
      if (currentUserRole !== 'head') {
        event.preventDefault();
        return;
      }
      draggedCard = event.target;
      event.target.classList.add('opacity-50', 'rotate-1');
      event.dataTransfer.effectAllowed = 'move';
    }

    function handleDragEnd(event) {
      if (currentUserRole !== 'head') return;
      event.target.classList.remove('opacity-50', 'rotate-1');
      document.querySelectorAll('[data-day]').forEach(td => td.classList.remove('drag-over'));
      draggedCard = null;
    }

    function handleDragOver(event) {
      if (currentUserRole !== 'head') return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      event.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(event) {
      if (currentUserRole !== 'head') return;
      event.currentTarget.classList.remove('drag-over');
    }

    async function handleDrop(event) {
      if (currentUserRole !== 'head') return;
      event.preventDefault();
      event.currentTarget.classList.remove('drag-over');

      if (!draggedCard) return;

      const scheduleId = draggedCard.dataset.scheduleId;
      const targetDay = event.currentTarget.dataset.day;
      const targetTime = event.currentTarget.dataset.time;

      if (!scheduleId || !targetDay || !targetTime) return;

      // Prevent dropping in blocked time slots (8-10 AM)
      if (targetTime === '8:00 AM - 9:00 AM' || targetTime === '9:00 AM - 10:00 AM') {
        showToast('Cannot drop in blocked staff meeting time (8:00 AM - 10:00 AM).');
        return;
      }

      // Find the schedule record
      const record = scheduleEntries.find(item => item.id === scheduleId);
      if (!record) return;

      // Check for conflicts at target slot
      const conflict = scheduleEntries.find(item =>
        item.id !== scheduleId &&
        item.diplomaCode === record.diplomaCode &&
        String(item.diplomaYear) === String(record.diplomaYear) &&
        String(item.semester) === String(record.semester) &&
        item.schoolYear === record.schoolYear &&
        item.day === targetDay &&
        item.scheduledTime === targetTime
      );

      if (conflict) {
        showToast(`Conflict: Another course (${conflict.courseCode}) already occupies ${targetDay} at ${targetTime}.`);
        return;
      }

      // Check for trainer conflict
      const trainerConflict = scheduleEntries.find(item =>
        item.id !== scheduleId &&
        item.assignedTrainer === record.assignedTrainer &&
        item.day === targetDay &&
        item.scheduledTime === targetTime
      );

      if (trainerConflict) {
        showToast(`Trainer conflict: ${record.assignedTrainer} already assigned to ${trainerConflict.courseCode} at ${targetDay} ${targetTime}.`);
        return;
      }

      // Update the record
      const updatedRecord = {
        ...record,
        day: targetDay,
        scheduledTime: targetTime
      };

      try {
        const path = `/api/records/${encodeURIComponent('Master Schedule')}/${encodeURIComponent(scheduleId)}`;
        await apiRequest(path, {
          method: 'PUT',
          body: JSON.stringify(updatedRecord)
        });
        await refreshDashboardData();
        showToast(`${record.courseCode} moved to ${targetDay} ${targetTime}.`);
      } catch (error) {
        showToast(error.message);
      }
    }

    // --------------------------------------------------------
    // DASHBOARD LOGIC (HEAD TRAINER ONLY)
    // --------------------------------------------------------
    function renderDashboard() {
      if (currentUserRole !== 'head') {
        showToast('Dashboard is only available for Head Trainer.');
        switchView('schedule');
        return;
      }

      // Populate diploma filter if not already done
      const diplomaSelect = document.getElementById('dashDiplomaFilter');
      if (diplomaSelect.options.length === 0) {
        diplomaSelect.innerHTML = curriculumDiplomas.map(item =>
          `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} - ${escapeHtml(item.title)}</option>`
        ).join('');
      }

      // Get filter values
      const schoolYear = document.getElementById('dashSchoolYearFilter').value;
      const diplomaCode = document.getElementById('dashDiplomaFilter').value;
      const yearLevel = document.getElementById('dashYearFilter').value;
      const semester = document.getElementById('dashSemFilter').value;

      // Filter schedule entries
      let filteredSchedule = scheduleEntries.filter(record =>
        String(record.schoolYear) === String(schoolYear) &&
        record.diplomaCode === diplomaCode
      );
      if (yearLevel) filteredSchedule = filteredSchedule.filter(r => String(r.diplomaYear) === String(yearLevel));
      if (semester) filteredSchedule = filteredSchedule.filter(r => String(r.semester) === String(semester));

      // Calculate KPIs
      const courseCount = filteredSchedule.length;
      const totalLectureUnits = filteredSchedule.reduce((sum, r) => sum + Number(r.lectureUnits || 0), 0);
      const totalLabUnits = filteredSchedule.reduce((sum, r) => sum + Number(r.labUnits || 0), 0);
      const totalLoadingUnits = totalLectureUnits + (totalLabUnits / 3);
      const totalContactHours = totalLectureUnits + (totalLabUnits * 1.5);

      // Get unique faculty from filtered schedule
      const normalizeName = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const facultyMap = new Map();

      for (const record of filteredSchedule) {
        const trainerKey = normalizeName(record.assignedTrainer);
        const faculty = facultyDatabase.find(person =>
          normalizeName(`${person.firstName} ${person.mi || ''} ${person.lastName}`) === trainerKey
        );
        const facultyKey = faculty?.id || trainerKey || 'unassigned';
        const facultyName = faculty
          ? `${faculty.firstName} ${faculty.mi || ''} ${faculty.lastName}`.replace(/\s+/g, ' ').trim()
          : (record.assignedTrainer || 'Unassigned');
        const role = faculty?.role || 'Unlisted';
        const department = faculty?.department || 'Unlisted';

        if (!facultyMap.has(facultyKey)) {
          facultyMap.set(facultyKey, {
            name: facultyName,
            role,
            department,
            loadingUnits: 0,
            contactHours: 0,
            courseCount: 0,
            isUnassigned: !faculty,
            trainer: record.assignedTrainer || '',
            firstRecord: record
          });
        }
        const f = facultyMap.get(facultyKey);
        f.loadingUnits += Number(record.lectureUnits || 0) + (Number(record.labUnits || 0) / 3);
        f.contactHours += Number(record.lectureUnits || 0) + (Number(record.labUnits || 0) * 1.5);
        f.courseCount += 1;
      }

      // Sort faculty by name
      const sortedFaculty = [...facultyMap.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );

      // Render KPI Row
      const kpiRow = document.getElementById('dashboardKpiRow');
      const kpiTile = (label, value, icon, iconTone, hint) => `
        <div class="card p-5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">${label}</span>
            <span class="w-8 h-8 rounded-lg flex items-center justify-center ${iconTone}"><span class="material-symbols-outlined">${icon}</span></span>
          </div>
          <div class="font-display mt-3 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">${value}</div>
          <div class="mt-1 text-xs text-slate-500 tabular-nums">${hint}</div>
        </div>`;
      kpiRow.innerHTML = `
        <div class="col-span-2 lg:col-span-1 rounded-2xl bg-blue-900 p-5 text-white shadow-sm">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-blue-200">Faculty Count</span>
            <span class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><span class="material-symbols-outlined text-blue-100">groups</span></span>
          </div>
          <div class="font-display mt-3 text-4xl font-bold tracking-tight tabular-nums">${facultyMap.size}</div>
          <div class="mt-1 text-xs text-blue-200">Trainers with assigned load</div>
        </div>
        ${kpiTile('Scheduled Courses', courseCount, 'event_note', 'bg-slate-100 text-slate-600', 'Timetable rows in filter')}
        ${kpiTile('Loading Units', totalLoadingUnits.toFixed(2), 'stacked_bar_chart', 'bg-blue-50 text-blue-600', 'Lec + Lab / 3')}
        ${kpiTile('Contact Hours', totalContactHours.toFixed(1), 'schedule', 'bg-amber-50 text-amber-600', 'Lec x 1.0 + Lab x 1.5')}
      `;

      // Render Faculty Workload Table
      const tbody = document.getElementById('dashboardFacultyBody');
      tbody.innerHTML = '';
      dashboardTrainerLinks = sortedFaculty;

      if (sortedFaculty.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-[13px] text-slate-500">No faculty assignments match the selected filters.</td></tr>`;
      } else {
        sortedFaculty.forEach((f, index) => {
          const tr = document.createElement('tr');
          tr.className = `transition ${f.isUnassigned ? 'bg-rose-50/60 hover:bg-rose-50' : 'hover:bg-slate-50'}`;
          tr.innerHTML = `
            <td class="py-3 px-3 border-b border-slate-100 font-semibold text-slate-900">${escapeHtml(f.name)}${f.isUnassigned ? ' <span class="text-rose-600 font-medium text-[11px]">(Unlisted)</span>' : ''}</td>
            <td class="py-3 px-3 border-b border-slate-100 text-right tabular-nums text-slate-700">${f.loadingUnits.toFixed(2)}</td>
            <td class="py-3 px-3 border-b border-slate-100 text-right tabular-nums text-slate-700">${f.contactHours.toFixed(1)}</td>
            <td class="py-3 px-3 border-b border-slate-100 text-right tabular-nums text-slate-700">${f.courseCount}</td>
            <td class="py-3 px-3 border-b border-slate-100 text-center">
              <span class="pill ring-1 ring-inset ${f.isUnassigned ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}">
                <span class="w-1.5 h-1.5 rounded-full ${f.isUnassigned ? 'bg-rose-500' : 'bg-emerald-500'}"></span>
                ${f.isUnassigned ? 'Unassigned' : 'Assigned'}
              </span>
            </td>
            <td class="py-3 px-3 border-b border-slate-100 text-center">
              <button class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition whitespace-nowrap" data-click="viewTrainerSchedule:${index}" title="Open the Master Schedule with ${escapeHtml(f.name)}'s classes highlighted" type="button">
                <span class="material-symbols-outlined text-[16px]">calendar_view_week</span>View schedule
              </button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }

      document.getElementById('dashboardWorkloadCount').textContent = `${facultyMap.size} faculty`;

      // Render Alerts
      renderDashboardAlerts(filteredSchedule, facultyMap);
    }

    function renderDashboardAlerts(filteredSchedule, facultyMap) {
      const alertsContainer = document.getElementById('dashboardAlerts');
      const alerts = [];

      // Check for unassigned schedule rows
      const unassignedRows = filteredSchedule.filter(record => {
        const trainerKey = normalizeName(record.assignedTrainer);
        const faculty = facultyDatabase.find(person =>
          normalizeName(`${person.firstName} ${person.mi || ''} ${person.lastName}`) === trainerKey
        );
        return !faculty && record.assignedTrainer;
      });

      if (unassignedRows.length > 0) {
        alerts.push({
          type: 'warning',
          icon: 'warning',
          title: 'Unassigned Trainers',
          message: `${unassignedRows.length} scheduled course row(s) have trainers not found in the Faculty Database. They will not appear in official reports.`,
          details: unassignedRows.map(r => `${r.courseCode} — ${r.courseName} (${r.assignedTrainer})`).join(', ')
        });
      }

      // Check for scheduling conflicts (same faculty, same day, overlapping time)
      // Simple conflict detection: same faculty assigned to multiple courses at same day/time
      const conflictMap = new Map();
      for (const record of filteredSchedule) {
        const key = `${record.assignedTrainer}|${record.day}|${record.scheduledTime}`;
        if (!conflictMap.has(key)) conflictMap.set(key, []);
        conflictMap.get(key).push(record);
      }

      const conflicts = [];
      for (const [key, records] of conflictMap.entries()) {
        if (records.length > 1) {
          const [trainer, day, time] = key.split('|');
          conflicts.push({
            trainer,
            day,
            time,
            courses: records.map(r => `${r.courseCode} (${r.courseName})`).join(', ')
          });
        }
      }

      if (conflicts.length > 0) {
        alerts.push({
          type: 'error',
          icon: 'error',
          title: 'Scheduling Conflicts',
          message: `${conflicts.length} conflict(s) detected: same trainer assigned to multiple courses at the same time slot.`,
          details: conflicts.map(c => `${c.trainer} on ${c.day} at ${c.time}: ${c.courses}`).join('; ')
        });
      }

      // Optional: could alert about faculty with zero assignments, but that's expected for filtered views

      // Render alerts
      if (alerts.length === 0) {
        alertsContainer.innerHTML = `
          <div class="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div class="flex items-start gap-3 text-emerald-800">
              <span class="material-symbols-outlined icon-fill text-emerald-600">check_circle</span>
              <span class="font-semibold text-[13px] leading-snug">No alerts — all assignments are valid and conflict-free.</span>
            </div>
          </div>
        `;
        return;
      }

      // Full class names (not built from fragments) so the Tailwind compiler can find them.
      const alertTones = {
        error: { box: 'border-rose-200 bg-rose-50/70', icon: 'text-rose-600', title: 'text-rose-900', message: 'text-rose-800', details: 'text-rose-700' },
        warning: { box: 'border-amber-200 bg-amber-50/70', icon: 'text-amber-600', title: 'text-amber-900', message: 'text-amber-800', details: 'text-amber-700' },
      };
      alertsContainer.innerHTML = alerts.map(alert => {
        const tone = alertTones[alert.type] || alertTones.warning;
        return `
        <div class="rounded-2xl border ${tone.box} p-4">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined icon-fill ${tone.icon}">${alert.icon}</span>
            <div class="flex-1 min-w-0">
              <div class="font-semibold ${tone.title} text-[13px]">${escapeHtml(alert.title)}</div>
              <div class="${tone.message} text-xs mt-0.5 leading-relaxed">${escapeHtml(alert.message)}</div>
              ${alert.details ? `<div class="text-[11px] ${tone.details} mt-1.5 leading-relaxed break-words">${escapeHtml(alert.details)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
      }).join('');
    }

    function normalizeName(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function syncDashboardToScheduleFilters() {
      const schoolYear = document.getElementById('dashSchoolYearFilter').value;
      const diplomaCode = document.getElementById('dashDiplomaFilter').value;
      const yearLevel = document.getElementById('dashYearFilter').value;
      const semester = document.getElementById('dashSemFilter').value;

      if (schoolYear) document.getElementById('schedSchoolYearFilter').value = schoolYear;
      if (diplomaCode) document.getElementById('schedDiplomaFilter').value = diplomaCode;
      if (yearLevel) document.getElementById('schedYearFilter').value = yearLevel;
      if (semester) document.getElementById('schedSemFilter').value = semester;
    }

    // Dashboard quick action: open the Master Schedule on the trainer's first class and highlight all of theirs.
    function viewTrainerSchedule(index) {
      const row = dashboardTrainerLinks[Number(index)];
      if (!row) return;
      const record = row.firstRecord;
      if (record.schoolYear) document.getElementById('schedSchoolYearFilter').value = record.schoolYear;
      document.getElementById('schedDiplomaFilter').value = record.diplomaCode;
      updateScheduleYearOptions();
      document.getElementById('schedYearFilter').value = String(record.diplomaYear);
      document.getElementById('schedSemFilter').value = String(record.semester);
      highlightedTrainer = normalizeName(row.trainer);
      document.getElementById('trainerHighlightName').textContent = row.name;
      syncScheduleToDashboardFilters();
      switchView('schedule');
    }

    function clearTrainerHighlight() {
      highlightedTrainer = '';
      renderTimetable();
    }

    function syncScheduleToDashboardFilters() {
      const schoolYear = document.getElementById('schedSchoolYearFilter').value;
      const diplomaCode = document.getElementById('schedDiplomaFilter').value;
      const yearLevel = document.getElementById('schedYearFilter').value;
      const semester = document.getElementById('schedSemFilter').value;

      if (schoolYear) document.getElementById('dashSchoolYearFilter').value = schoolYear;
      if (diplomaCode) document.getElementById('dashDiplomaFilter').value = diplomaCode;
      if (yearLevel) document.getElementById('dashYearFilter').value = yearLevel;
      if (semester) document.getElementById('dashSemFilter').value = semester;
    }

    // 4. FACULTY DATABASE LOGIC
    // --------------------------------------------------------
    function getVisibleFaculty() {
      const query = document.getElementById('facultySearchInput').value.toLowerCase();
      let list = facultyDatabase;

      if (currentFacultyFilter === 'shared') {
        list = list.filter(f => f.isShared);
      } else if (currentFacultyFilter !== 'all') {
        list = list.filter(f =>
          f.dept === currentFacultyFilter ||
          (f.sharedGroup && f.sharedGroup.includes(currentFacultyFilter))
        );
      }

      return list.filter(f =>
        f.lastName.toLowerCase().includes(query) ||
        f.firstName.toLowerCase().includes(query) ||
        (f.quals || '').toLowerCase().includes(query) ||
        (f.email || '').toLowerCase().includes(query)
      );
    }

    function renderFacultyTable(list) {
      const tbody = document.getElementById('facultyTableBody');
      tbody.innerHTML = '';

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-[13px] text-slate-500">No faculty records match the specified filter.</td></tr>`;
        return;
      }

      list.forEach(f => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";

        tr.innerHTML = `
          <td class="py-3 px-3 border-b border-slate-100 font-semibold text-slate-900">${escapeHtml(f.lastName)}</td>
          <td class="py-3 px-3 border-b border-slate-100 text-slate-700">${escapeHtml(f.firstName)}</td>
          <td class="py-3 px-2 border-b border-slate-100 text-center text-slate-500">${escapeHtml(f.mi || '')}</td>
          <td class="py-3 px-3 border-b border-slate-100">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-semibold text-slate-900">${escapeHtml(f.dept)}</span>
              ${f.isShared ? `
                <span class="pill bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 !text-[11px]">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Shared Faculty
                </span>
              ` : ''}
              ${f.leadTag ? `
                <span class="pill bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200 !text-[11px]">
                  ${escapeHtml(f.leadTag)}
                </span>
              ` : ''}
            </div>
          </td>
          <td class="py-3 px-3 border-b border-slate-100">
            <span class="pill ring-1 ring-inset ${(f.role || '').includes('Specialist') ? 'bg-blue-50 text-blue-800 ring-blue-200' : 'bg-slate-50 text-slate-700 ring-slate-200'}">
              ${escapeHtml(f.role)}
            </span>
          </td>
          <td class="py-3 px-3 border-b border-slate-100 text-slate-600 max-w-xs truncate" title="${escapeHtml(f.quals || '')}">${escapeHtml(f.quals || '')}</td>
          <td class="py-3 px-3 border-b border-slate-100 text-slate-700 text-xs tabular-nums whitespace-nowrap">${escapeHtml(f.mobile || 'Sign in to view')}</td>
          <td class="py-3 px-3 border-b border-slate-100 text-blue-600 text-xs">${escapeHtml(f.email || 'Sign in to view')}</td>
          <td class="py-3 px-3 border-b border-slate-100 text-center">
            <div class="flex items-center justify-center gap-1">
              ${currentUserRole === 'head' ? `
                <button data-faculty-add class="px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-[11px] font-semibold transition">
                  Add
                </button>
                <button data-faculty-edit="${escapeHtml(f.id)}" class="px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-[11px] font-semibold transition">
                  Edit
                </button>
                <button data-faculty-delete="${escapeHtml(f.id)}" class="px-2 py-1 rounded-md text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-[11px] font-semibold transition">
                  Remove
                </button>
              ` : ''}
              <button data-faculty-load="${escapeHtml(f.id)}" class="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-100 text-[11px] font-semibold whitespace-nowrap transition">
                View Load
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll('[data-faculty-add]').forEach(button =>
        button.addEventListener('click', () => openFacultyModal('add'))
      );
      tbody.querySelectorAll('[data-faculty-edit]').forEach(button =>
        button.addEventListener('click', () => openFacultyModal('edit', button.dataset.facultyEdit))
      );
      tbody.querySelectorAll('[data-faculty-delete]').forEach(button =>
        button.addEventListener('click', () => removeFaculty(button.dataset.facultyDelete))
      );
      tbody.querySelectorAll('[data-faculty-load]').forEach(button =>
        button.addEventListener('click', () => openTrainerModalById(button.dataset.facultyLoad))
      );
    }

    function handleFacultySearch() {
      renderFacultyTable(getVisibleFaculty());
    }

    function filterFaculty(dept) {
      currentFacultyFilter = dept;
      document.querySelectorAll('.faculty-chip').forEach(c => {
        if (c.getAttribute('data-dept') === dept) {
          c.className = "faculty-chip shrink-0 px-3 py-1 rounded-full border border-blue-900 bg-blue-900 text-white text-xs font-semibold transition";
        } else {
          c.className = "faculty-chip shrink-0 px-3 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-900 text-xs font-medium transition";
        }
      });

      renderFacultyTable(getVisibleFaculty());
    }

    // --------------------------------------------------------
    // 5. CURRICULUM CENTRAL REGISTRY RENDERING
    // --------------------------------------------------------
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]);
    }

    function getDiplomaDurationYears(diplomaCode) {
      const duration = Number(curriculumDiplomas.find(diploma => diploma.code === diplomaCode)?.durationYears);
      return Number.isInteger(duration) && duration >= 1 && duration <= 6 ? duration : 3;
    }

    function setYearLevelOptions(select, yearCount, selectedValue, includeAll = false) {
      const yearNames = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
      const options = includeAll ? ['<option value="ALL">All Year Levels</option>'] : [];
      for (let year = 1; year <= yearCount; year++) {
        options.push(`<option value="${year}">${yearNames[year - 1]} Year</option>`);
      }
      select.innerHTML = options.join('');
      const requested = String(selectedValue ?? '');
      select.value = options.length && [...select.options].some(option => option.value === requested)
        ? requested
        : includeAll ? 'ALL' : '1';
    }

    function updateScheduleYearOptions() {
      const diplomaCode = document.getElementById('schedDiplomaFilter').value;
      const years = getDiplomaDurationYears(diplomaCode);
      const select = document.getElementById('schedYearFilter');
      setYearLevelOptions(select, years, select.value);
    }

    function updateTargetDiplomaYearOptions() {
      const diplomaCode = document.getElementById('curricTargetDiploma').value;
      const years = getDiplomaDurationYears(diplomaCode);
      const select = document.getElementById('curricTargetYear');
      setYearLevelOptions(select, years, select.value);
    }

    function updateCurriculumYearOptions() {
      const diplomaCode = document.getElementById('curriculumDiplomaSelect').value;
      const years = diplomaCode === 'ALL'
        ? Math.max(1, ...curriculumDiplomas.map(diploma => getDiplomaDurationYears(diploma.code)))
        : getDiplomaDurationYears(diplomaCode);
      const select = document.getElementById('curriculumYearSelect');
      setYearLevelOptions(select, years, select.value, true);
    }

    function refreshCurriculumDiplomaOptions() {
      const filter = document.getElementById('curriculumDiplomaSelect');
      const target = document.getElementById('curricTargetDiploma');
      const selectedFilter = filter.value;
      const selectedTarget = target.value;

      filter.innerHTML = [
        '<option value="ALL">Show All Approved Diplomas</option>',
        ...curriculumDiplomas.map(diploma =>
          `<option value="${escapeHtml(diploma.code)}">${escapeHtml(diploma.code)} - ${escapeHtml(diploma.title)}</option>`
        )
      ].join('');
      target.innerHTML = curriculumDiplomas.map(diploma =>
        `<option value="${escapeHtml(diploma.code)}">${escapeHtml(diploma.code)} - ${escapeHtml(diploma.title)}</option>`
      ).join('');

      filter.value = curriculumDiplomas.some(diploma => diploma.code === selectedFilter)
        ? selectedFilter
        : 'ALL';
      target.value = curriculumDiplomas.some(diploma => diploma.code === selectedTarget)
        ? selectedTarget
        : (curriculumDiplomas[0]?.code || '');
      updateTargetDiplomaYearOptions();
    }

    function appendEmptyDiplomaCard(diploma, container) {
      const card = document.createElement('div');
      card.className = "card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3";

      const details = document.createElement('div');
      const name = document.createElement('h4');
      name.className = "text-[15px] font-bold text-slate-900";
      name.textContent = `${diploma.code} - ${diploma.title}`;
      const note = document.createElement('p');
      note.className = "text-xs text-slate-500 mt-1";
      note.textContent = `${getDiplomaDurationYears(diploma.code)}-year program. No curriculum sections yet.`;
      details.append(name, note);
      card.appendChild(details);

      if (currentUserRole === 'head') {
        const addCourseButton = document.createElement('button');
        addCourseButton.className = "btn-primary";
        addCourseButton.textContent = "Add First Course";
        addCourseButton.addEventListener('click', () => openAddCurriculumModal('course', diploma.code));
        card.appendChild(addCourseButton);
      }

      container.appendChild(card);
    }

    const openCurriculumDiplomas = new Set(); // keeps panels open across re-renders

    function renderCurriculumSections() {
      refreshCurriculumDiplomaOptions();
      updateCurriculumYearOptions();
      const diplomaFilter = document.getElementById('curriculumDiplomaSelect').value;
      const yearFilter = document.getElementById('curriculumYearSelect').value;
      const container = document.getElementById('curriculumContainers');
      container.innerHTML = '';
      const isHead = currentUserRole === 'head';
      const columnCount = isHead ? 8 : 7;

      const codes = [...new Set([
        ...curriculumDiplomas.map(diploma => diploma.code),
        ...curriculumSections.map(section => section.diploma)
      ])].filter(code => diplomaFilter === 'ALL' || code === diplomaFilter);

      for (const code of codes) {
        const allSections = curriculumSections.filter(section => section.diploma === code);
        const diploma = curriculumDiplomas.find(item => item.code === code);
        if (allSections.length === 0) {
          if (diploma) appendEmptyDiplomaCard(diploma, container);
          continue;
        }
        const sections = allSections
          .filter(section => yearFilter === 'ALL' || section.yearLevel === yearFilter)
          .sort((a, b) => Number(a.yearLevel) - Number(b.yearLevel) || Number(a.semester) - Number(b.semester));
        if (sections.length === 0) continue;

        const courses = sections.flatMap(section => section.courses);
        const totalUnits = courses.reduce((sum, course) => sum + course.total, 0);
        const panel = document.createElement('details');
        panel.className = "card overflow-hidden group";
        panel.open = openCurriculumDiplomas.has(code) || diplomaFilter === code;
        panel.addEventListener('toggle', () => {
          if (panel.open) openCurriculumDiplomas.add(code); else openCurriculumDiplomas.delete(code);
        });

        panel.innerHTML = `
          <summary class="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 shrink-0 rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-200 flex items-center justify-center">
                <span class="material-symbols-outlined icon-fill text-amber-500 text-[22px]">folder</span>
              </div>
              <div class="min-w-0">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-amber-700 tabular-nums">
                  ${getDiplomaDurationYears(code)}-year program · ${sections.length} ${sections.length === 1 ? 'term' : 'terms'}
                </span>
                <h4 class="text-[15px] font-bold text-slate-900 truncate">${escapeHtml(sections[0].diplomaTitle)}</h4>
              </div>
            </div>
            <div class="flex items-center gap-2 tabular-nums">
              <span class="pill bg-slate-100 text-slate-600">Courses: ${courses.length}</span>
              <span class="pill bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200">Total: ${totalUnits} Units</span>
              <span class="material-symbols-outlined ml-1 text-[20px] text-slate-500 transition-transform duration-200 group-open:rotate-180">expand_more</span>
            </div>
          </summary>
          <div class="overflow-x-auto custom-scroll border-t border-slate-100">
            <table class="w-full text-left text-[13px] border-collapse min-w-[780px]">
              <thead>
                <tr>
                  <th class="th w-28">Course Code</th>
                  <th class="th">Course Name</th>
                  <th class="th text-center w-24">Lec Units</th>
                  <th class="th text-center w-24">Lab Units</th>
                  <th class="th text-center w-24">Total Units</th>
                  <th class="th w-32">Pre-requisites</th>
                  <th class="th">Resultant Qualification</th>
                  ${isHead ? '<th class="th text-center w-24">Actions</th>' : ''}
                </tr>
              </thead>
              ${sections.map(sec => `
                <tbody>
                  <tr>
                    <td colspan="${columnCount}" class="border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-xs font-semibold text-slate-700">${escapeHtml(sec.yearRevision)}</span>
                        <span class="text-[11px] tabular-nums text-slate-500">${sec.courses.length} ${sec.courses.length === 1 ? 'course' : 'courses'} · ${sec.courses.reduce((sum, c) => sum + c.total, 0)} units</span>
                      </div>
                    </td>
                  </tr>
                  ${sec.courses.map((c, index) => `
                    <tr class="hover:bg-slate-50 transition">
                      <td class="py-3 px-3 border-b border-slate-100 font-semibold text-blue-900 tabular-nums whitespace-nowrap">${escapeHtml(c.code)}</td>
                      <td class="py-3 px-3 border-b border-slate-100 font-medium text-slate-800">${escapeHtml(c.name)}</td>
                      <td class="py-3 px-3 border-b border-slate-100 text-center tabular-nums text-slate-600">${c.lec}</td>
                      <td class="py-3 px-3 border-b border-slate-100 text-center tabular-nums text-slate-600">${c.lab}</td>
                      <td class="py-3 px-3 border-b border-slate-100 text-center tabular-nums font-semibold text-blue-700">${c.total}</td>
                      <td class="py-3 px-3 border-b border-slate-100 text-slate-500 text-xs">${escapeHtml(c.prereq)}</td>
                      <td class="py-3 px-3 border-b border-slate-100">
                        <span class="pill bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <span class="material-symbols-outlined icon-fill text-[14px] text-emerald-500">verified</span>
                          ${escapeHtml(c.qual)}
                        </span>
                      </td>
                      ${isHead ? `
                        <td class="py-3 px-3 border-b border-slate-100 text-center">
                          <button data-edit-section="${escapeHtml(sec.id)}" data-edit-course="${index}" class="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-100 text-[11px] font-semibold transition">
                            Edit
                          </button>
                        </td>
                      ` : ''}
                    </tr>
                  `).join('')}
                </tbody>
              `).join('')}
            </table>
          </div>
        `;
        container.appendChild(panel);
        panel.querySelectorAll('[data-edit-section]').forEach(button => {
          button.addEventListener('click', () => {
            openEditCurriculumCourse(button.dataset.editSection, Number(button.dataset.editCourse));
          });
        });
      }

      if (!container.children.length) {
        container.innerHTML = `<div class="card p-10 text-center text-[13px] text-slate-500">No curriculum matrices match the specified criteria.</div>`;
      }
    }

    // --------------------------------------------------------
    // TRAINER MODAL & WORKLOAD ENGINE
    // --------------------------------------------------------
    function openTrainerModalByName(name) {
      const match = facultyDatabase.find(f =>
        `${f.firstName} ${f.lastName}`.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(f.lastName.toLowerCase())
      );
      if (match) openTrainerModalById(match.id);
    }

    function openTrainerModalById(id) {
      const trainer = facultyDatabase.find(f => String(f.id) === String(id));
      if (!trainer) {
        showToast('The selected faculty member is not available.');
        return;
      }
      selectedTrainerForModal = trainer;

      const modal = document.getElementById('trainerModal');
      document.getElementById('modalTrainerFullName').innerText = `${trainer.firstName} ${trainer.mi} ${trainer.lastName}`;
      document.getElementById('modalTrainerAvatar').innerText = `${trainer.firstName[0]}${trainer.lastName[0]}`;
      document.getElementById('modalTrainerDepartment').innerText = `${trainer.dept} ${trainer.isShared ? '(Shared: ' + trainer.sharedGroup + ')' : ''}`;
      document.getElementById('modalTrainerPhone').innerText = trainer.mobile || 'Sign in to view';
      document.getElementById('modalTrainerEmail').innerText = trainer.email || 'Sign in to view';

      const courseContainer = document.getElementById('modalTrainerCourseList');
      courseContainer.innerHTML = '';

      let totalCalculatedHours = 0;
      let totalUnits = 0;

      (trainer.courses || []).forEach(c => {
        // Calculation Formula: Lecture x 1.0 hr + Lab x 1.5 hrs
        const hours = (c.lec * 1.0) + (c.lab * 1.5);
        totalCalculatedHours += hours;
        totalUnits += c.total;

        const row = document.createElement('div');
        row.className = "flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200 text-xs";
        row.innerHTML = `
          <div class="min-w-0">
            <div class="font-semibold text-blue-900 tabular-nums">${escapeHtml(c.code)}</div>
            <div class="text-xs text-slate-600 truncate">${escapeHtml(c.name)}</div>
          </div>
          <div class="text-right shrink-0 tabular-nums">
            <span class="font-semibold text-slate-900">${c.total} Units</span>
            <span class="text-[11px] text-slate-500 block">${hours.toFixed(1)} Contact Hrs/Wk</span>
          </div>
        `;
        courseContainer.appendChild(row);
      });

      document.getElementById('modalTrainerHoursBadge').innerText =
        `Total: ${totalUnits} Units (${totalCalculatedHours.toFixed(1)} Weekly Contact Hrs)`;

      modal.classList.remove('hidden');
    }

    function closeTrainerModal() {
      document.getElementById('trainerModal').classList.add('hidden');
    }

    function jumpToFacultyFromModal() {
      closeTrainerModal();
      switchView('faculty');
      if (selectedTrainerForModal) {
        document.getElementById('facultySearchInput').value = selectedTrainerForModal.lastName;
        handleFacultySearch();
      }
    }

    // --------------------------------------------------------
    // FACULTY ADD / EDIT MODAL
    // --------------------------------------------------------
    let currentEditFacultyId = null;

    function openFacultyModal(mode, id = null) {
      if (currentUserRole !== 'head') {
        showToast("Only the Head Trainer can add or edit faculty records.");
        return;
      }

      currentEditFacultyId = id;
      const modal = document.getElementById('facultyFormModal');
      const title = document.getElementById('facultyFormTitle');

      if (mode === 'edit' && id) {
        title.innerText = "Edit Faculty Record";
        const f = facultyDatabase.find(item => item.id === id);
        if (f) {
          document.getElementById('facLastName').value = f.lastName;
          document.getElementById('facFirstName').value = f.firstName;
          document.getElementById('facMI').value = f.mi;
          document.getElementById('facRole').value = f.role;
          document.getElementById('facDept').value = f.isShared ? f.sharedGroup : f.dept;
          document.getElementById('facQuals').value = f.quals;
          document.getElementById('facMobile').value = f.mobile;
          document.getElementById('facEmail').value = f.email;
        }
      } else {
        title.innerText = "Add Faculty Member";
        document.getElementById('facLastName').value = "";
        document.getElementById('facFirstName').value = "";
        document.getElementById('facMI').value = "";
        document.getElementById('facQuals').value = "";
        document.getElementById('facMobile').value = "+63";
        document.getElementById('facEmail').value = "";
      }
      modal.classList.remove('hidden');
    }

    function closeFacultyFormModal() {
      document.getElementById('facultyFormModal').classList.add('hidden');
    }

    async function handleSaveFaculty(e) {
      e.preventDefault();
      if (currentUserRole !== 'head') {
        showToast("Only the Head Trainer can add or edit faculty records.");
        return;
      }

      const lastName = document.getElementById('facLastName').value;
      const firstName = document.getElementById('facFirstName').value;
      const mi = document.getElementById('facMI').value;
      const role = document.getElementById('facRole').value;
      const deptValue = document.getElementById('facDept').value;
      const quals = document.getElementById('facQuals').value;
      const mobile = document.getElementById('facMobile').value;
      const email = document.getElementById('facEmail').value;

      const record = {
        id: currentEditFacultyId || crypto.randomUUID(),
        lastName,
        firstName,
        mi,
        role,
        qualifications: quals,
        mobileNumber: mobile,
        email,
        department: deptValue
      };
      try {
        const path = `/api/records/Faculty`;
        await apiRequest(currentEditFacultyId ? `${path}/${encodeURIComponent(currentEditFacultyId)}` : path, {
          method: currentEditFacultyId ? 'PUT' : 'POST',
          body: JSON.stringify(record)
        });
        closeFacultyFormModal();
        await refreshDashboardData();
        showToast(currentEditFacultyId
          ? `Faculty record for ${firstName} ${lastName} updated.`
          : `New faculty ${firstName} ${lastName} added.`);
      } catch (error) {
        showToast(error.message);
      }
    }

    async function removeFaculty(id) {
      if (currentUserRole !== 'head') {
        showToast('Only the Head Trainer can remove faculty records.');
        return;
      }
      const faculty = facultyDatabase.find(person => String(person.id) === String(id));
      if (!faculty || !window.confirm(`Remove ${faculty.firstName} ${faculty.lastName} from the faculty database?`)) return;
      try {
        await apiRequest(`/api/records/Faculty/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await refreshDashboardData();
        showToast(`${faculty.firstName} ${faculty.lastName} removed from the faculty database.`);
      } catch (error) {
        showToast(error.message);
      }
    }

    // --------------------------------------------------------
    // CURRICULUM ADD MODAL
    // --------------------------------------------------------
    let curriculumFormMode = 'course';
    let editingCurriculumCourse = null;

    function openAddCurriculumModal(mode = 'course', diplomaCode = '') {
      if (currentUserRole !== 'head') {
        showToast("Only the Head Trainer can add courses or diplomas.");
        return;
      }

      refreshCurriculumDiplomaOptions();
      document.querySelector('#addCurriculumModal form').reset();
      document.getElementById('curricDiplomaYears').value = '3';
      setCurriculumFormMode(mode);
      if (diplomaCode) {
        document.getElementById('curricTargetDiploma').value = diplomaCode;
      }
      updateTargetDiplomaYearOptions();
      if (mode === 'edit-course') {
        const section = curriculumSections.find(item => item.id === editingCurriculumCourse?.sectionId);
        const course = section?.courses[editingCurriculumCourse?.courseIndex];
        if (section && course) {
          document.getElementById('curricTargetYear').value = section.yearLevel;
          document.getElementById('curricTargetSem').value = section.semester;
          document.getElementById('curricCourseCode').value = course.code;
          document.getElementById('curricCourseName').value = course.name;
          document.getElementById('curricLecUnits').value = course.lec;
          document.getElementById('curricLabUnits').value = course.lab;
          document.getElementById('curricPrereq').value = course.prereq;
          document.getElementById('curricQual').value = course.qual;
        }
      }
      document.getElementById('addCurriculumModal').classList.remove('hidden');
    }

    function setCurriculumFormMode(mode) {
      curriculumFormMode = mode;
      const isDiplomaMode = mode === 'diploma';
      const isEditingCourse = mode === 'edit-course';
      document.getElementById('curriculumFormModeSwitch').classList.toggle('hidden', isEditingCourse);
      const courseFields = document.getElementById('courseFormFields');
      const diplomaFields = document.getElementById('diplomaFormFields');
      const courseButton = document.getElementById('curriculumCourseModeButton');
      const diplomaButton = document.getElementById('curriculumDiplomaModeButton');

      courseFields.classList.toggle('hidden', isDiplomaMode);
      diplomaFields.classList.toggle('hidden', !isDiplomaMode);
      courseFields.querySelectorAll('input, select').forEach(field => {
        field.disabled = isDiplomaMode ||
          (isEditingCourse && ['curricTargetDiploma', 'curricTargetYear', 'curricTargetSem'].includes(field.id));
      });
      diplomaFields.querySelectorAll('input').forEach(field => {
        field.disabled = !isDiplomaMode;
      });
      const activeTab = "relative rounded-md px-3 py-2 font-semibold text-blue-900 transition-colors duration-200";
      const idleTab = "relative rounded-md px-3 py-2 font-semibold text-slate-600 transition-colors duration-200 hover:text-slate-900";
      courseButton.className = isDiplomaMode ? idleTab : activeTab;
      diplomaButton.className = isDiplomaMode ? activeTab : idleTab;
      document.getElementById('curriculumModePill').classList.toggle('translate-x-[calc(100%+4px)]', isDiplomaMode);
      courseButton.setAttribute('aria-pressed', String(!isDiplomaMode));
      diplomaButton.setAttribute('aria-pressed', String(isDiplomaMode));
      courseButton.disabled = isEditingCourse;
      diplomaButton.disabled = isEditingCourse;
      document.getElementById('curriculumFormTitle').innerText = isEditingCourse
        ? "Edit Course in Curriculum Registry"
        : isDiplomaMode
          ? "Add a Diploma to the Registry"
          : "Add Course to Curriculum Registry";
      document.getElementById('curriculumSubmitButton').innerText = isEditingCourse
        ? "Save Changes"
        : isDiplomaMode
          ? "Add Diploma"
          : "Add Course";
    }

    function closeAddCurriculumModal() {
      document.getElementById('addCurriculumModal').classList.add('hidden');
      editingCurriculumCourse = null;
      setCurriculumFormMode('course');
    }

    // Import Sheet Modal Functions
    function openImportSheetModal() {
      if (currentUserRole !== 'head') {
        showToast('Only the Head Trainer can import from Google Sheets.');
        return;
      }
      document.getElementById('importSheetInput').value = '';
      document.getElementById('importSheetModal').classList.remove('hidden');
    }

    function closeImportSheetModal() {
      document.getElementById('importSheetModal').classList.add('hidden');
    }

    async function handleImportSheet() {
      if (currentUserRole !== 'head') return;

      const input = document.getElementById('importSheetInput').value.trim();
      if (!input) {
        showToast('Enter a Google Sheet ID or URL.');
        return;
      }

      // Extract Sheet ID from URL if full URL provided
      const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const sheetId = match ? match[1] : input;

      const submitBtn = document.getElementById('importSheetSubmit');
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Importing...';

      try {
        const result = await apiRequest('/api/import/sheet', {
          method: 'POST',
          body: JSON.stringify({ spreadsheetId: sheetId })
        });

        if (result.ok) {
          const imported = result.result.imported;
          const errors = result.result.errors;
          let msg = `Imported: `;
          msg += Object.entries(imported).map(([tab, count]) => `${tab}: ${count}`).join(', ');
          if (errors.length) msg += ` | Errors: ${errors.join(', ')}`;
          showToast(msg);
          closeImportSheetModal();
          await refreshDashboardData();
        } else {
          showToast(result.error || 'Import failed.');
        }
      } catch (error) {
        showToast(error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Import';
      }
    }

    // Saves the picked diploma/year (or all of them) as Google Sheets in Drive: Diploma's / Year N.
    async function uploadCurriculumToDrive() {
      if (currentUserRole !== 'head') {
        showToast('Only the Head Trainer can upload to Google Drive.');
        return;
      }
      const diplomaCode = document.getElementById('curriculumDiplomaSelect').value;
      const year = document.getElementById('curriculumYearSelect').value;
      const button = document.getElementById('driveUploadButton');
      button.disabled = true;
      showToast('Uploading curriculum to Google Drive...');
      try {
        const { uploaded } = await apiRequest('/api/drive/curriculum', {
          method: 'POST',
          body: JSON.stringify({ diplomaCode, year })
        });
        showToast(uploaded.length === 1
          ? `Saved "${uploaded[0].fileName}" to Diploma's / Year ${uploaded[0].year} in Drive.`
          : `Saved ${uploaded.length} curriculum sheets to Diploma's in Drive.`);
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
      }
    }

    // mode 'print' reuses this dialog to print locally (any role); otherwise it exports to Drive (Head only).
    function openCurriculumPdfModal(mode) {
      const print = mode === 'print';
      if (!print && currentUserRole !== 'head') {
        showToast('Only the Head Trainer can export to Google Drive.');
        return;
      }
      const diplomaSelect = document.getElementById('pdfDiplomaSelect');
      diplomaSelect.innerHTML = '<option value="ALL">All Diplomas</option>' + curriculumDiplomas.map(item =>
        `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} - ${escapeHtml(item.title)}</option>`).join('');
      const picked = document.getElementById('curriculumDiplomaSelect').value;
      diplomaSelect.value = [...diplomaSelect.options].some(option => option.value === picked) ? picked : 'ALL';
      updatePdfYearOptions(document.getElementById('curriculumYearSelect').value);
      const result = document.getElementById('pdfExportResult');
      result.replaceChildren();
      result.classList.add('hidden');
      document.getElementById('pdfModalIcon').textContent = print ? 'print' : 'picture_as_pdf';
      document.getElementById('pdfModalTitle').textContent = print ? 'Print Curriculum' : 'Export Curriculum to PDF';
      document.getElementById('pdfModalNote').classList.toggle('hidden', print);
      const submit = document.getElementById('pdfExportSubmit');
      submit.textContent = print ? 'Print' : 'Export';
      submit.dataset.click = print ? 'printCurriculumReport' : 'exportCurriculumPdf';
      document.getElementById('curriculumPdfModal').classList.remove('hidden');
    }

    function closeCurriculumPdfModal() {
      document.getElementById('curriculumPdfModal').classList.add('hidden');
    }

    function updatePdfYearOptions(selectedValue) {
      const diplomaCode = document.getElementById('pdfDiplomaSelect').value;
      const select = document.getElementById('pdfYearSelect');
      const years = diplomaCode === 'ALL'
        ? Math.max(1, ...curriculumDiplomas.map(diploma => getDiplomaDurationYears(diploma.code)))
        : getDiplomaDurationYears(diplomaCode);
      setYearLevelOptions(select, years, typeof selectedValue === 'string' ? selectedValue : select.value, true);
    }

    // Saves the picked diploma/year as Google Sheets, exports each to PDF in Drive, and lists the PDF links.
    async function exportCurriculumPdf() {
      if (currentUserRole !== 'head') return;
      const button = document.getElementById('pdfExportSubmit');
      const result = document.getElementById('pdfExportResult');
      button.disabled = true;
      button.textContent = 'Exporting...';
      try {
        const { uploaded } = await apiRequest('/api/drive/curriculum', {
          method: 'POST',
          body: JSON.stringify({
            diplomaCode: document.getElementById('pdfDiplomaSelect').value,
            year: document.getElementById('pdfYearSelect').value,
            pdf: true
          })
        });
        result.replaceChildren(...uploaded.map(file => {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.textContent = `${file.fileName}.pdf`;
          link.className = 'font-semibold text-blue-700 hover:underline';
          link.target = '_blank';
          link.rel = 'noopener';
          if (/^https:\/\//.test(file.pdfLink || '')) link.href = file.pdfLink;
          item.append(link);
          return item;
        }));
        result.classList.remove('hidden');
        showToast(`Exported ${uploaded.length} PDF${uploaded.length === 1 ? '' : 's'} to the Curriculum PDFs folder.`);
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
        button.textContent = 'Export';
      }
    }

    function openEditCurriculumCourse(sectionId, courseIndex) {
      if (currentUserRole !== 'head') {
        showToast("Only the Head Trainer can edit curriculum courses.");
        return;
      }

      const section = curriculumSections.find(item => item.id === sectionId);
      const course = section?.courses[courseIndex];
      if (!section || !course) {
        showToast("The selected course could not be found.");
        return;
      }

      editingCurriculumCourse = { sectionId, courseIndex };
      openAddCurriculumModal('edit-course', section.diploma);
    }

    async function handleSaveCurriculum(e) {
      e.preventDefault();
      if (currentUserRole !== 'head') {
        showToast("Only the Head Trainer can add courses or diplomas.");
        return;
      }

      if (curriculumFormMode === 'diploma') {
        const code = document.getElementById('curricDiplomaCode').value.trim().toUpperCase();
        const title = document.getElementById('curricDiplomaTitle').value.trim();
        const durationYears = Number(document.getElementById('curricDiplomaYears').value);
        if (!code || !title) {
          showToast("Enter both a diploma code and a diploma name.");
          return;
        }
        if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 6) {
          showToast("Diploma Years must be a whole number between 1 and 6.");
          return;
        }

        const duplicate = curriculumDiplomas.some(diploma =>
          diploma.code.toLowerCase() === code.toLowerCase() ||
          diploma.title.toLowerCase() === title.toLowerCase()
        );

        if (duplicate) {
          showToast("That diploma code or name is already in the registry.");
          return;
        }

        try {
          await apiRequest('/api/records/Diplomas', {
            method: 'POST',
            body: JSON.stringify({ id: crypto.randomUUID(), code, name: title, durationYears })
          });
          await refreshDashboardData();
          document.getElementById('curriculumDiplomaSelect').value = code;
          document.getElementById('curricTargetDiploma').value = code;
          closeAddCurriculumModal();
          renderCurriculumSections();
          showToast(`${code} - ${title} added to the diploma registry.`);
        } catch (error) {
          showToast(error.message);
        }
        return;
      }

      if (curriculumFormMode === 'edit-course') {
        const section = curriculumSections.find(item => item.id === editingCurriculumCourse?.sectionId);
        const course = section?.courses[editingCurriculumCourse?.courseIndex];
        if (!section || !course) {
          showToast("The selected course could not be found.");
          closeAddCurriculumModal();
          return;
        }

        const lec = parseInt(document.getElementById('curricLecUnits').value, 10);
        const lab = parseInt(document.getElementById('curricLabUnits').value, 10);
        const record = {
          id: course.id,
          diplomaCode: section.diploma,
          diplomaName: curriculumDiplomas.find(item => item.code === section.diploma)?.title || section.diploma,
          diplomaYear: Number(section.yearLevel),
          semester: Number(section.semester),
          code: document.getElementById('curricCourseCode').value.trim(),
          name: document.getElementById('curricCourseName').value.trim(),
          lecUnits: lec,
          labUnits: lab,
          totalUnits: lec + lab,
          prerequisites: document.getElementById('curricPrereq').value.trim(),
          qualification: document.getElementById('curricQual').value.trim(),
        };
        try {
          await apiRequest(`/api/records/Courses/${encodeURIComponent(course.id)}`, {
            method: 'PUT',
            body: JSON.stringify(record)
          });
          closeAddCurriculumModal();
          await refreshDashboardData();
          showToast(`Course ${record.code} updated.`);
        } catch (error) {
          showToast(error.message);
        }
        return;
      }

      const diploma = document.getElementById('curricTargetDiploma').value;
      const year = document.getElementById('curricTargetYear').value;
      const sem = document.getElementById('curricTargetSem').value;
      const code = document.getElementById('curricCourseCode').value;
      const name = document.getElementById('curricCourseName').value;
      const lec = parseInt(document.getElementById('curricLecUnits').value, 10);
      const lab = parseInt(document.getElementById('curricLabUnits').value, 10);
      const prereq = document.getElementById('curricPrereq').value;
      const qual = document.getElementById('curricQual').value;

      const diplomaInfo = curriculumDiplomas.find(item => item.code === diploma);
      const newCourse = {
        id: crypto.randomUUID(),
        diplomaCode: diploma,
        diplomaName: diplomaInfo?.title || diploma,
        diplomaYear: Number(year),
        semester: Number(sem),
        code: code.trim(),
        name: name.trim(),
        lecUnits: lec,
        labUnits: lab,
        totalUnits: lec + lab,
        prerequisites: prereq.trim(),
        qualification: qual.trim(),
      };
      try {
        await apiRequest('/api/records/Courses', {
          method: 'POST',
          body: JSON.stringify(newCourse)
        });
        closeAddCurriculumModal();
        await refreshDashboardData();
        showToast(`Course ${newCourse.code} added to ${diploma} curriculum registry.`);
      } catch (error) {
        showToast(error.message);
      }
    }

    // --------------------------------------------------------
    // EVENT WIRING (strict CSP: no inline on*="" handlers)
    // Markup declares data-click / data-change / data-input / data-submit
    // as "action" or "action:argument", several joined with "|".
    // Only actions listed here can run.
    // --------------------------------------------------------
    const pageActions = {
      switchView, startRolePreview, handleSidebarAuthAction, handleQuickAddAction,
      printFacultyLoadingReport, printCurriculumReport, uploadCurriculumToDrive, showToast,
      renderTimetable, renderDashboard, renderCurriculumSections,
      syncScheduleToDashboardFilters, syncDashboardToScheduleFilters,
      handleFacultySearch, filterFaculty, openFacultyModal, closeFacultyFormModal, handleSaveFaculty,
      openAddCurriculumModal, closeAddCurriculumModal, setCurriculumFormMode, handleSaveCurriculum,
      updateTargetDiplomaYearOptions, openImportSheetModal,
      openCurriculumPdfModal, closeCurriculumPdfModal, updatePdfYearOptions, exportCurriculumPdf,
      viewTrainerSchedule, clearTrainerHighlight, closeImportSheetModal, handleImportSheet,
      closeTrainerModal, jumpToFacultyFromModal, closeScheduleModal,
    };

    for (const type of ['click', 'change', 'input', 'submit']) {
      document.addEventListener(type, event => {
        const element = event.target.closest?.(`[data-${type}]`);
        if (!element) return;
        for (const step of element.dataset[type].split('|')) {
          const split = step.indexOf(':');
          const name = split === -1 ? step : step.slice(0, split);
          const action = pageActions[name];
          if (!action) {
            console.error(`Unknown page action: ${name}`);
            continue;
          }
          if (split !== -1) action(step.slice(split + 1));
          else if (type === 'submit') action(event);
          else action();
        }
      });
    }

    // --------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------
    window.addEventListener('DOMContentLoaded', async () => {
      facultyDatabase = [];
      curriculumDiplomas = [];
      curriculumSections = [];
      scheduleEntries = [];
      setAuthenticatedUser(null);
      switchView('login');
      document.body.removeAttribute('data-loading');
      const identityInitialization = initializeGoogleIdentity();
      try {
        await refreshDashboardData();
      } catch (error) {
        const status = document.getElementById('googleConnectionStatus');
        status.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Unavailable`;
        showToast(error.message);
      }
      await identityInitialization;
      // rolePreviewEnabled shows the buttons; do NOT auto-start — user picks role or signs in
    });
