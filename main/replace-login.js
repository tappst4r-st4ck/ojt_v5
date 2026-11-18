const fs = require('fs');
let content = fs.readFileSync('d:/User Files/Desktop/School/3rd Term/Practicium (OJT)/OJT Project/ojt_v5/main/public/tesda-main-screen.html', 'utf8');

const oldSectionStart = content.indexOf('<!-- ======================================================== -->\n<!-- VIEW 1: LOGIN GATEWAY');
const oldSectionEnd = content.indexOf('<!-- ======================================================== -->\n<!-- VIEW 2: DASHBOARD');

const newSection = `<!-- ======================================================== -->
<!-- VIEW 1: LOGIN GATEWAY                                    -->
<!-- ======================================================== -->
<section class="relative isolate flex min-h-full w-full flex-col bg-gradient-to-b from-[#f3f7fd] via-[#e9f1fc] to-[#eff5fd] hidden" id="view-login">
<!-- Fluid Animated Aurora Gradient Background Orbs -->
<div class="absolute inset-0 pointer-events-none overflow-hidden select-none">
<div class="absolute -top-32 -left-32 w-[580px] h-[580px] rounded-full bg-gradient-to-br from-blue-400/30 via-indigo-500/25 to-sky-300/20 blur-[110px] animate-float-1"></div>
<div class="absolute -bottom-36 -right-24 w-[620px] h-[620px] rounded-full bg-gradient-to-tl from-sky-400/30 via-blue-600/20 to-teal-300/15 blur-[120px] animate-float-2"></div>
<div class="absolute top-1/2 left-1/2 w-[720px] h-[720px] rounded-full bg-gradient-to-r from-indigo-300/20 via-blue-400/20 to-cyan-300/20 blur-[130px] animate-float-3"></div>
<!-- Subtle organic grid backdrop for institutional precision -->
<div class="absolute inset-0 opacity-[0.025]" style="background-image: radial-gradient(#004ac6 1px, transparent 1px); background-size: 24px 24px;"></div>
</div>
<!-- Center Card Section -->
<div class="relative w-full min-h-[calc(100vh-8rem)] flex items-center justify-center p-4 sm:p-6 md:p-8 z-10">
<div class="relative w-full bg-white/85 backdrop-blur-2xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-15px_rgba(0,40,95,0.12),0_4px_16px_-4px_rgba(0,35,90,0.06)] p-6 sm:p-8 flex flex-col gap-6 transition-all duration-300 hover:shadow-[0_24px_70px_-12px_rgba(0,40,95,0.16)] max-w-md">
<!-- Header Branding & Institutional Seal -->
<div class="flex flex-col items-center text-center">
<div class="relative mb-3.5 flex items-center justify-center">
<!-- Fluid Aura Glow behind Logo -->
<div class="absolute -inset-2.5 rounded-full bg-gradient-to-r from-blue-500/30 via-sky-400/35 to-indigo-500/30 blur-md"></div>
<div class="relative p-1.5 rounded-full bg-white/90 shadow-md border border-white/80 backdrop-blur-md">
<div class="w-20 h-20 rounded-full bg-gradient-to-b from-white to-blue-50/50 flex items-center justify-center overflow-hidden shadow-inner p-1">
<img alt="Technical Education and Skills Development Authority Seal" class="w-full h-full object-contain transition-transform duration-500 hover:scale-105" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCVO71uF-Vl9-ZyViUZmBnW5l63LEov1k3hX_3WPZOg91qD-BDW5I7de5Etf7MeR-_xIevF3k3DGdATnQplIQg6Vk-QvxAlZQBOo4tkmOc_LfxnNVSGlLSgXu5ydx58795hYuNja7EUghJ5nm9mhZu-AfpKtDh3mDzP3W-J9NqEyGPmU1F8CKtGeB3FyBAGTYIlmAXYIJCVXVTT55IwPu1AYK4n_s5EO53Y9CCmsaK59jg_r3pR2qxFow"/>
</div>
<div class="absolute bottom-0 right-0 bg-gradient-to-tr from-primary to-blue-500 text-white rounded-full p-1.5 shadow-md border-2 border-white flex items-center justify-center">
<span class="material-symbols-outlined text-[13px] block">verified</span>
</div>
</div>
</div>
<span class="font-label-sm text-label-sm uppercase text-slate-500 tracking-widest font-semibold">Republic of the Philippines</span>
<h1 class="font-headline-lg text-[23px] sm:text-headline-lg text-slate-900 tracking-tight mt-1.5 font-bold bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent">
            TESDA Institutional Operations Portal
          </h1>
<p class="font-body-md text-body-md text-slate-600 mt-1 max-w-md leading-relaxed">
            Automated Timetable, Faculty Loading & TVET Curriculum Operations
          </p>
</div>
<!-- SSO Protocol Notice Card -->
<!-- SSO Gateway Button -->
<div class="flex flex-col">
<button class="relative group overflow-hidden w-full h-12 bg-white hover:bg-slate-50 border border-slate-200/80 hover:border-blue-300 transition-all duration-200 rounded-xl flex items-center justify-between px-4 sm:px-5 shadow-sm hover:shadow-md active:scale-[0.99]" type="button" id="googleIdentityButton">
<!-- Hover Sheen Effect -->
<div class="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-in-out pointer-events-none"></div>
<div class="flex items-center gap-3.5">
<svg aria-hidden="true" class="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" viewbox="0 0 24 24">
<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"></path>
<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"></path>
</svg>
<span class="font-label-lg text-label-lg text-slate-800 font-semibold group-hover:text-primary transition-colors">Sign in with Google Workspace</span>
</div>
<div class="flex items-center gap-1.5 bg-blue-50 text-secondary border border-blue-100 py-1 px-2.5 rounded-full shadow-xs">
<span class="material-symbols-outlined text-[14px]">domain</span>
<span class="font-label-sm text-label-sm uppercase font-semibold">Official SSO Gateway</span>
</div>
</button>
</div>
<!-- Divider with Text -->
<div class="relative flex items-center justify-center my-0.5">
<div class="absolute inset-0 flex items-center">
<div class="w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent h-[1px]"></div>
</div>
<div class="relative bg-white/90 backdrop-blur-sm px-3 rounded-full border border-slate-100 shadow-2xs">
<span class="font-label-sm text-label-sm uppercase text-slate-400 font-medium tracking-wider">or simulate authentication role (testing mode)</span>
</div>
</div>
<!-- Role Simulation Radio Cards -->
<div class="flex flex-col gap-2.5" id="rolePreviewControls">
<!-- Head Trainer Card -->
<label class="group relative flex items-start gap-3.5 p-4 rounded-2xl cursor-pointer bg-gradient-to-r from-blue-50/90 to-indigo-50/60 border-2 border-blue-500/70 shadow-sm transition-all duration-200 hover:shadow-md">
<input checked="" class="mt-1 w-4 h-4 text-primary shrink-0 accent-primary cursor-pointer" name="auth_simulation_role" onchange="updateRoleStyles()" type="radio" value="admin"/>
<div class="flex-1 min-w-0">
<div class="flex items-center justify-between gap-2">
<div class="flex items-center gap-2">
<div class="w-7 h-7 rounded-lg bg-blue-600/10 flex items-center justify-center text-secondary">
<span class="material-symbols-outlined text-[18px]">admin_panel_settings</span>
</div>
<span class="font-headline-sm text-headline-sm text-slate-900 font-semibold">Head Trainer (Admin)</span>
</div>
<span class="bg-blue-600 text-white font-label-sm text-label-sm uppercase px-2.5 py-0.5 rounded-full shadow-xs font-semibold tracking-wide">Full Permissions</span>
</div>
<p class="font-body-sm text-body-sm text-slate-600 mt-1.5 leading-snug">Full Read/Write Access - Master Timetable editing, Faculty Loading, and Curriculum Registry</p>
<div class="mt-2.5 pt-2 border-t border-blue-100/70 flex items-center gap-2 font-tabular-data text-tabular-data text-secondary">
<span class="material-symbols-outlined text-[15px]">account_circle</span>
<span class="font-semibold text-slate-800">Engr. Ramon Morales</span>
<span class="text-slate-500 text-[11px]">(r.morales@tesda.gov.ph)</span>
</div>
</div>
</label>
<!-- Viewer Card -->
<label class="group relative flex items-start gap-3.5 p-4 rounded-2xl cursor-pointer bg-white/70 hover:bg-slate-50/90 border border-slate-200/80 hover:border-blue-200 shadow-2xs transition-all duration-200 hover:shadow-sm">
<input class="mt-1 w-4 h-4 text-primary shrink-0 accent-primary cursor-pointer" name="auth_simulation_role" onchange="updateRoleStyles()" type="radio" value="viewer"/>
<div class="flex-1 min-w-0">
<div class="flex items-center justify-between gap-2">
<div class="flex items-center gap-2">
<div class="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:text-primary transition-colors">
<span class="material-symbols-outlined text-[18px]">school</span>
</div>
<span class="font-headline-sm text-headline-sm text-slate-800 font-semibold">Faculty / Trainee (Viewer)</span>
</div>
<span class="bg-slate-100 text-slate-600 font-label-sm text-label-sm uppercase px-2.5 py-0.5 rounded-full font-semibold tracking-wide">Read-Only</span>
</div>
<p class="font-body-sm text-body-sm text-slate-600 mt-1.5 leading-snug">Read-Only Access - Weekly class schedules, syllabus consultation, and contact hour verification</p>
<div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-2 font-tabular-data text-tabular-data text-slate-600">
<span class="material-symbols-outlined text-[15px]">account_circle</span>
<span class="font-medium text-slate-800">Maria Santos</span>
<span class="text-slate-500 text-[11px]">(m.santos@tesda.gov.ph)</span>
</div>
</div>
</label>
</div>
<!-- Quick Login Action Buttons -->
<div class="pt-1">
<button class="relative group overflow-hidden w-full h-12 bg-gradient-to-r from-blue-600 via-primary to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white transition-all duration-200 rounded-xl flex items-center justify-center gap-2.5 shadow-md hover:shadow-blue-500/25 px-5 active:scale-[0.99]" onclick="startRolePreview('head')" type="button"><span class="material-symbols-outlined text-[20px] transition-transform duration-200 group-hover:translate-x-0.5">arrow_forward</span><span class="font-label-lg text-label-lg font-semibold tracking-wide">Enter Operations Portal</span></button>
</div>
<!-- Mandatory Operational Rules Card -->
<!-- Bottom Legal Disclosure Note -->
<div class="text-center pt-0.5">
<p aria-live="polite" class="hidden rounded-lg border border-rose-300/30 bg-rose-950/40 px-3 py-2 text-center text-[11px] text-rose-200" id="authMessage"></p>
<span class="font-body-sm text-[11.5px] text-slate-400 leading-snug block">
            Protected under Republic Act 7796 (Technical Education and Skills Development Act of 1994) - Philippine Data Privacy Act of 2012 (RA 10173) Compliant.
          </span>
</div>
</div>
</div>
</section>
`;

const newContent = content.slice(0, oldSectionStart) + newSection + content.slice(oldSectionEnd);
fs.writeFileSync('d:/User Files/Desktop/School/3rd Term/Practicium (OJT)/OJT Project/ojt_v5/main/public/tesda-main-screen.html', newContent, 'utf8');
console.log('Replacement done successfully');