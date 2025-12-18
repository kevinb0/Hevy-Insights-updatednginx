/**
 * CSV Parser for Hevy workout data
 * 
 * Expected CSV format:
 * title; start_time; end_time; description; exercise_title; superset_id; 
 * exercise_notes; set_index; set_type; weight_kg; reps; distance_km; 
 * duration_seconds; rpe
 * 
 * TODO: What to do if weight is LBS (weight_lbs)?
**/

export interface CSVRow {
  title: string;
  start_time: string;
  end_time: string;
  description: string;
  exercise_title: string;
  superset_id: string;
  exercise_notes: string;
  set_index: string;
  set_type: string;
  weight_kg: string;
  reps: string;
  distance_km: string;
  duration_seconds: string;
  rpe: string;
}

export interface ParsedWorkout {
  id: string;
  title: string;
  start_time: number;
  end_time: number | null;
  description: string | null;
  exercises: ParsedExercise[];
  estimated_volume_kg?: number;
}

export interface ParsedExercise {
  id: string;
  title: string;
  superset_id: string | null;
  notes: string | null;
  sets: ParsedSet[];
  exercise?: {
    url: string | null;
  };
}

export interface ParsedSet {
  id: string;
  index: number;
  set_type: string | null;
  weight_kg: number | null;
  reps: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  rpe: number | null;
}

export function parseCSV(csvContent: string): ParsedWorkout[] {
  const lines = csvContent.trim().split("\n");
  
  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Parse header
  const headerLine = lines[0];
  if (!headerLine) {
    throw new Error("CSV header is missing");
  }
  
  // Parse CSV line respecting quoted values
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  const headers = parseCSVLine(headerLine);
  
  const expectedHeaders = [
    "title", "start_time", "end_time", "description", "exercise_title",
    "superset_id", "exercise_notes", "set_index", "set_type", "weight_kg",
    "reps", "distance_km", "duration_seconds", "rpe"
  ]; // TODO: Handle weight in LBS?

  // Validate headers
  if (headers.length !== expectedHeaders.length) {
    throw new Error(`Invalid CSV format. Expected ${expectedHeaders.length} columns, got ${headers.length}`);
  }

  const workoutsMap = new Map<string, ParsedWorkout>();

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const lineData = lines[i];
    if (!lineData) continue;
    const line = lineData.trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    
    if (values.length !== headers.length) {
      console.warn(`Skipping row ${i + 1}: Expected ${headers.length} columns, got ${values.length}`);
      continue;
    }

    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });

    const workoutKey = `${row.title}_${row.start_time}`;

    // Create or get workout
    if (!workoutsMap.has(workoutKey)) {
      const startTime = parseDate(row.start_time);
      const endTime = row.end_time ? parseDate(row.end_time) : null;

      workoutsMap.set(workoutKey, {
        id: `csv_${workoutKey}_${Date.now()}`,
        title: row.title || "Unnamed Workout",
        start_time: startTime,
        end_time: endTime,
        description: row.description && row.description.trim() !== "" && row.description !== '"' ? row.description : null,
        exercises: [],
        estimated_volume_kg: 0
      });
    }

    const workout = workoutsMap.get(workoutKey)!;

    // Find or create exercise
    let exercise = workout.exercises.find(ex => ex.title === row.exercise_title);
    
    if (!exercise) {
      exercise = {
        id: `${workout.id}_ex_${workout.exercises.length}_${row.exercise_title}`,
        title: row.exercise_title || "Unknown Exercise",
        superset_id: row.superset_id && row.superset_id.trim() !== "" && row.superset_id !== '"' ? row.superset_id : null,
        notes: row.exercise_notes && row.exercise_notes.trim() !== "" && row.exercise_notes !== '"' ? row.exercise_notes : null,
        sets: [],
        exercise: {
          url: null
        }
      };
      workout.exercises.push(exercise);
    }

    // Add set
    const weight = row.weight_kg ? parseFloat(row.weight_kg) : null;
    const reps = row.reps ? parseInt(row.reps) : null;
    const set: ParsedSet = {
      id: `csv_set_${row.set_index}_${Date.now()}`,
      index: parseInt(row.set_index) || 0,
      set_type: row.set_type || null,
      weight_kg: weight,
      reps: reps,
      distance_km: row.distance_km ? parseFloat(row.distance_km) : null,
      duration_seconds: row.duration_seconds ? parseInt(row.duration_seconds) : null,
      rpe: row.rpe ? parseFloat(row.rpe) : null
    };

    exercise.sets.push(set);
    
    // Calculate volume for this set
    if (weight && reps) {
      workout.estimated_volume_kg = (workout.estimated_volume_kg || 0) + (weight * reps);
    }
  }

  const workouts = Array.from(workoutsMap.values());

  // Sort workouts by start_time (newest first)
  workouts.sort((a, b) => b.start_time - a.start_time);

  return workouts;
}

function parseDate(dateString: string): number {
  try {
    // Handle German month names: "16 Dez 2025, 15:06"
    const germanMonths: Record<string, string> = {
      "Jan": "Jan", "Feb": "Feb", "Mär": "Mar", "Mar": "Mar", "Apr": "Apr",
      "Mai": "May", "Jun": "Jun", "Jul": "Jul", "Aug": "Aug",
      "Sep": "Sep", "Okt": "Oct", "Nov": "Nov", "Dez": "Dec"
    };
    
    let normalizedDate = dateString;
    
    // Replace German month abbreviations with English
    for (const [german, english] of Object.entries(germanMonths)) {
      if (dateString.includes(german)) {
        normalizedDate = dateString.replace(german, english);
        break;
      }
    }
    
    // Try parsing
    const date = new Date(normalizedDate);
    
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${dateString}`);
    }
    
    return Math.floor(date.getTime() / 1000); // Convert to Unix timestamp
  } catch (error) {
    console.error(`Failed to parse date: ${dateString}`, error);
    return Math.floor(Date.now() / 1000); // Fallback to current time
  }
}

export function validateCSVFile(file: File): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!file.name.endsWith(".csv")) {
      reject(new Error("File must be a CSV file"));
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      reject(new Error("File size must be less than 10MB"));
      return;
    }

    resolve(true);
  });
}

export function readCSVFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsText(file);
  });
}
