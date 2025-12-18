/**
 * CSV Calculator Utility
 * 
 * Calculates statistics and analytics from CSV workout data
 * Separated from API logic to maintain clean architecture
 *
**/

// Use the same workout structure from CSV parser
interface Workout {
  id: string;
  title: string;
  start_time: number;
  end_time: number | null;
  description: string | null;
  exercises: Exercise[];
  [key: string]: any;
}

interface Exercise {
  id: string;
  title: string;
  sets: Set[];
  [key: string]: any;
}

interface Set {
  id: string;
  index: number;
  set_type: string | null;
  weight_kg: number | null;
  reps: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  [key: string]: any;
}

export interface CSVStats {
  totalVolume: number;
  avgVolumePerWorkout: number;
  totalWorkouts: number;
  totalSets: number;
  totalReps: number;
  muscleDistribution: Record<string, number>;
  prsOverTime: Array<{ date: string; count: number }>;
  topExercises: Array<{ name: string; volume: number; sets: number }>;
}

/**
 * Calculate total volume (weight * reps) from workouts
*/
export function calculateTotalVolume(workouts: Workout[]): number {
  let total = 0;
  
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        if (set.weight_kg && set.reps) {
          total += set.weight_kg * set.reps;
        }
      }
    }
  }
  
  return Math.round(total);
}

/**
 * Calculate average volume per workout
 */
export function calculateAvgVolume(workouts: Workout[]): number {
  if (workouts.length === 0) return 0;
  const totalVolume = calculateTotalVolume(workouts);
  return Math.round(totalVolume / workouts.length);
}

/**
 * Calculate muscle distribution from exercises
 * Maps exercise names to muscle groups
 */
export function calculateMuscleDistribution(workouts: Workout[]): Record<string, number> {
  const muscleGroups: Record<string, number> = {
    chest: 0,
    back: 0,
    shoulders: 0,
    biceps: 0,
    triceps: 0,
    legs: 0,
    core: 0,
  };

  // Exercise name to muscle group mapping
  const exerciseToMuscle: Record<string, string[]> = {
    // Chest
    'bench press': ['chest'],
    'incline bench': ['chest'],
    'decline bench': ['chest'],
    'chest press': ['chest'],
    'chest fly': ['chest'],
    'pec deck': ['chest'],
    'push up': ['chest', 'triceps'],
    'dips': ['chest', 'triceps'],
    
    // Back
    'deadlift': ['back', 'legs'],
    'pull up': ['back', 'biceps'],
    'chin up': ['back', 'biceps'],
    'lat pulldown': ['back'],
    'seated row': ['back'],
    'cable row': ['back'],
    'bent over row': ['back'],
    'barbell row': ['back'],
    't-bar row': ['back'],
    'reverse fly': ['back', 'shoulders'],
    
    // Shoulders
    'shoulder press': ['shoulders'],
    'overhead press': ['shoulders'],
    'military press': ['shoulders'],
    'lateral raise': ['shoulders'],
    'front raise': ['shoulders'],
    'rear delt': ['shoulders'],
    'shrug': ['shoulders'],
    
    // Arms
    'bicep curl': ['biceps'],
    'biceps curl': ['biceps'],
    'hammer curl': ['biceps'],
    'preacher curl': ['biceps'],
    'concentration curl': ['biceps'],
    'ez bar': ['biceps', 'triceps'],
    'reverse curl': ['biceps'],
    
    'tricep extension': ['triceps'],
    'triceps extension': ['triceps'],
    'tricep pushdown': ['triceps'],
    'triceps pushdown': ['triceps'],
    'skull crusher': ['triceps'],
    'overhead extension': ['triceps'],
    'close grip': ['triceps'],
    
    // Legs
    'squat': ['legs'],
    'leg press': ['legs'],
    'leg extension': ['legs'],
    'leg curl': ['legs'],
    'lunge': ['legs'],
    'calf raise': ['legs'],
    'romanian deadlift': ['legs', 'back'],
    'leg raise': ['core', 'legs'],
    
    // Core
    'plank': ['core'],
    'crunch': ['core'],
    'sit up': ['core'],
    'ab wheel': ['core'],
    'russian twist': ['core'],
    'hanging leg raise': ['core'],
  };

  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const exerciseName = exercise.title.toLowerCase();
      const setCount = exercise.sets.length;
      
      let matched = false;
      
      // Check each pattern
      for (const [pattern, muscles] of Object.entries(exerciseToMuscle)) {
        if (exerciseName.includes(pattern)) {
          for (const muscle of muscles) {
            if (muscleGroups[muscle] !== undefined) {
              muscleGroups[muscle] += setCount;
            }
          }
          matched = true;
          break;
        }
      }
      
      // If no match found, default based on workout title
      if (!matched) {
        const workoutTitle = workout.title.toLowerCase();
        if (workoutTitle.includes('chest') || workoutTitle.includes('brust')) {
          muscleGroups.chest = (muscleGroups.chest || 0) + setCount;
        } else if (workoutTitle.includes('back') || workoutTitle.includes('rücken')) {
          muscleGroups.back = (muscleGroups.back || 0) + setCount;
        } else if (workoutTitle.includes('leg') || workoutTitle.includes('bein')) {
          muscleGroups.legs = (muscleGroups.legs || 0) + setCount;
        } else if (workoutTitle.includes('shoulder') || workoutTitle.includes('schulter')) {
          muscleGroups.shoulders = (muscleGroups.shoulders || 0) + setCount;
        } else if (workoutTitle.includes('arm') || workoutTitle.includes('bicep') || workoutTitle.includes('tricep')) {
          muscleGroups.biceps = (muscleGroups.biceps || 0) + setCount / 2;
          muscleGroups.triceps = (muscleGroups.triceps || 0) + setCount / 2;
        }
      }
    }
  }

  return muscleGroups;
}

/**
 * Calculate PRs over time
 * For CSV data, we estimate PRs based on weight increases
 */
export function calculatePRsOverTime(workouts: Workout[]): Array<{ date: string; count: number }> {
  // Track max weight for each exercise
  const exerciseMaxes = new Map<string, number>();
  const prsByDate = new Map<string, number>();

  // Sort workouts by date (oldest first for tracking progression)
  const sortedWorkouts = [...workouts].sort((a, b) => a.start_time - b.start_time);

  for (const workout of sortedWorkouts) {
    const date = new Date(workout.start_time * 1000).toISOString().split('T')[0];
    let prsInWorkout = 0;

    for (const exercise of workout.exercises) {
      const exerciseName = exercise.title;
      
      for (const set of exercise.sets) {
        if (set.weight_kg && set.reps && set.set_type === "normal") {
          // Calculate estimated 1RM: weight * (1 + reps/30)
          const estimated1RM = set.weight_kg * (1 + set.reps / 30);
          
          const currentMax = exerciseMaxes.get(exerciseName) || 0;
          
          if (estimated1RM > currentMax) {
            exerciseMaxes.set(exerciseName, estimated1RM);
            prsInWorkout++;
          }
        }
      }
    }

    if (prsInWorkout > 0 && date) {
      prsByDate.set(date, (prsByDate.get(date) || 0) + prsInWorkout);
    }
  }

  // Convert to array and sort by date
  return Array.from(prsByDate.entries())
    .map(([dateStr, count]) => ({ date: dateStr, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate top exercises by volume
 */
export function calculateTopExercises(workouts: Workout[], limit = 10): Array<{ name: string; volume: number; sets: number }> {
  const exerciseStats = new Map<string, { volume: number; sets: number }>();

  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      let exerciseVolume = 0;
      let exerciseSets = exercise.sets.length;
      
      for (const set of exercise.sets) {
        if (set.weight_kg && set.reps) {
          exerciseVolume += set.weight_kg * set.reps;
        }
      }

      const current = exerciseStats.get(exercise.title) || { volume: 0, sets: 0 };
      exerciseStats.set(exercise.title, {
        volume: current.volume + exerciseVolume,
        sets: current.sets + exerciseSets,
      });
    }
  }

  return Array.from(exerciseStats.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);
}

/**
 * Calculate comprehensive statistics for CSV data
 */
export function calculateCSVStats(workouts: Workout[]): CSVStats {
  return {
    totalVolume: calculateTotalVolume(workouts),
    avgVolumePerWorkout: calculateAvgVolume(workouts),
    totalWorkouts: workouts.length,
    totalSets: workouts.reduce((sum, w) => sum + w.exercises.reduce((s, e) => s + e.sets.length, 0), 0),
    totalReps: workouts.reduce((sum, w) => sum + w.exercises.reduce((s, e) => s + e.sets.reduce((r, set) => r + (set.reps || 0), 0), 0), 0),
    muscleDistribution: calculateMuscleDistribution(workouts),
    prsOverTime: calculatePRsOverTime(workouts),
    topExercises: calculateTopExercises(workouts),
  };
}
