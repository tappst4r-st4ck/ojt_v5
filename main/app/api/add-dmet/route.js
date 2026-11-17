import { appendRecord, listRecords } from "../../../lib/google-sheets.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    // Check if DMET already exists
    const diplomas = await listRecords("Diplomas");
    const dmetExists = diplomas.some(d => d.code === "DMET");
    
    if (dmetExists) {
      return Response.json({ ok: true, message: "DMET diploma already exists" });
    }
    
    console.log("Adding DMET diploma...");
    
    // Add DMET diploma
    await appendRecord("Diplomas", {
      id: "diploma-dmet",
      code: "DMET",
      name: "Diploma in Machining Technology",
      durationYears: 3,
    });
    
    // Add DMET courses
    const dmetCourses = [
      { id: "course-8", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 1, semester: 1, code: "MAC 111", name: "Benchwork and Layout", lecUnits: 1, labUnits: 3, totalUnits: 4, prerequisites: "None", qualification: "Machining NC I" },
      { id: "course-9", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 1, semester: 1, code: "MAC 112", name: "Lathe Operations", lecUnits: 1, labUnits: 3, totalUnits: 4, prerequisites: "None", qualification: "Machining NC I" },
      { id: "course-10", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 1, semester: 2, code: "MAC 121", name: "Milling Operations", lecUnits: 1, labUnits: 3, totalUnits: 4, prerequisites: "MAC 112", qualification: "Machining NC II" },
      { id: "course-11", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 1, semester: 2, code: "MAC 122", name: "Grinding Operations", lecUnits: 1, labUnits: 2, totalUnits: 3, prerequisites: "MAC 111", qualification: "Machining NC II" },
      { id: "course-12", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 2, semester: 1, code: "MAC 211", name: "CNC Lathe Programming", lecUnits: 2, labUnits: 2, totalUnits: 4, prerequisites: "MAC 121", qualification: "CNC Lathe Operation NC II" },
      { id: "course-13", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 2, semester: 1, code: "MAC 212", name: "CNC Milling Programming", lecUnits: 2, labUnits: 2, totalUnits: 4, prerequisites: "MAC 121", qualification: "CNC Milling Operation NC II" },
      { id: "course-14", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 2, semester: 2, code: "MAC 221", name: "Advanced CNC and CAD/CAM", lecUnits: 1, labUnits: 3, totalUnits: 4, prerequisites: "MAC 211, MAC 212", qualification: "CAD/CAM Operation NC III" },
    ];
    
    for (const course of dmetCourses) {
      await appendRecord("Courses", course);
    }
    
    // Add DMET schedule
    const dmetSchedule = [
      { id: "schedule-8", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 1, semester: 1, schoolYear: "SY 2024-2025", day: "Monday", scheduledTime: "8:00 AM - 11:30 AM", courseCode: "MAC 111", courseName: "Benchwork and Layout", assignedTrainer: "Alexander O. Dagohoy", lectureUnits: 1, labUnits: 3 },
      { id: "schedule-9", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 1, semester: 1, schoolYear: "SY 2024-2025", day: "Wednesday", scheduledTime: "8:00 AM - 11:30 AM", courseCode: "MAC 112", courseName: "Lathe Operations", assignedTrainer: "Haitham Jenor L. Sedomar", lectureUnits: 1, labUnits: 3 },
      { id: "schedule-10", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 1, semester: 2, schoolYear: "SY 2024-2025", day: "Tuesday", scheduledTime: "8:00 AM - 11:30 AM", courseCode: "MAC 121", courseName: "Milling Operations", assignedTrainer: "Alexander O. Dagohoy", lectureUnits: 1, labUnits: 3 },
      { id: "schedule-11", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 1, semester: 2, schoolYear: "SY 2024-2025", day: "Thursday", scheduledTime: "8:00 AM - 11:30 AM", courseCode: "MAC 122", courseName: "Grinding Operations", assignedTrainer: "Haitham Jenor L. Sedomar", lectureUnits: 1, labUnits: 2 },
      { id: "schedule-12", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 2, semester: 1, schoolYear: "SY 2024-2025", day: "Monday", scheduledTime: "1:00 PM - 5:00 PM", courseCode: "MAC 211", courseName: "CNC Lathe Programming", assignedTrainer: "Belinda C. Dacoco", lectureUnits: 2, labUnits: 2 },
      { id: "schedule-13", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 2, semester: 1, schoolYear: "SY 2024-2025", day: "Wednesday", scheduledTime: "1:00 PM - 5:00 PM", courseCode: "MAC 212", courseName: "CNC Milling Programming", assignedTrainer: "Belinda C. Dacoco", lectureUnits: 2, labUnits: 2 },
      { id: "schedule-14", diplomaCode: "DMET", diplomaName: "Diploma in Machining Technology", diplomaYear: 2, semester: 2, schoolYear: "SY 2024-2025", day: "Friday", scheduledTime: "8:00 AM - 12:00 PM", courseCode: "MAC 221", courseName: "Advanced CNC and CAD/CAM", assignedTrainer: "Albert B. Bravo Jr.", lectureUnits: 1, labUnits: 3 },
    ];
    
    for (const schedule of dmetSchedule) {
      await appendRecord("Master Schedule", schedule);
    }
    
    return Response.json({ ok: true, message: "DMET diploma added successfully" });
  } catch (error) {
    console.error("Error adding DMET:", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}