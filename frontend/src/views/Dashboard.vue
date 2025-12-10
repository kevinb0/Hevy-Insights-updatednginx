<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useHevyCache } from "../stores/hevy_cache";
import { Line, Doughnut } from "vue-chartjs";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const store = useHevyCache();
const chartData = ref<any>(null);
const muscleGroupData = ref<any>(null);

const loading = computed(() => store.isLoadingWorkouts || store.isLoadingUser);
const userAccount = computed(() => store.userAccount);
const workouts = computed(() => store.workouts);

// ---------- Weekly Aggregations & Filters ----------
type Range = "1m" | "3m" | "6m" | "1y" | "all";
const range = ref<Range>("6m");

const startOfWeek = (d: Date) => {
  const dd = new Date(d);
  const day = dd.getDay(); // 0=Sun
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  dd.setDate(dd.getDate() + offsetToMonday);
  dd.setHours(0,0,0,0);
  return dd;
};
const weekKey = (d: Date) => {
  const m = startOfWeek(d);
  return m.toISOString().slice(0,10);
};

const filteredByRange = computed(() => {
  const now = new Date();
  let weeksBack = 26; // default ~6 months
  if (range.value === "1m") weeksBack = 4;
  else if (range.value === "3m") weeksBack = 12;
  else if (range.value === "6m") weeksBack = 26; // approx 6 months
  else if (range.value === "1y") weeksBack = 52;
  else if (range.value === "all") weeksBack = 520;
  const start = startOfWeek(new Date(now));
  start.setDate(start.getDate() - weeksBack * 7);
  const cutoff = Math.floor(start.getTime() / 1000);
  return workouts.value.filter((w: any) => (w.start_time || 0) >= cutoff);
});

const weeksAgg = computed(() => {
  const map: Record<string, {
    durationMin: number;
    volumeKg: number;
    reps: number;
    sets: number;
    workouts: number;
  }> = {};
  for (const w of filteredByRange.value) {
    const d = new Date((w.start_time || 0) * 1000);
    const key = weekKey(d);
    const entry = (map[key] ||= { durationMin: 0, volumeKg: 0, reps: 0, sets: 0, workouts: 0 });
    entry.workouts += 1;
    entry.volumeKg += w.estimated_volume_kg || 0;
    const dur = Math.max(0, Math.floor(((w.end_time || w.start_time || 0) - (w.start_time || 0)) / 60));
    entry.durationMin += dur;
    for (const ex of (w.exercises || [])) {
      for (const s of (ex.sets || [])) {
        entry.sets += 1;
        entry.reps += s.reps || 0;
      }
    }
  }
  // sorted by week ascending
  const keys = Object.keys(map).sort();
  return keys.map(k => ({ week: k, ...map[k] }));
});

// Hours trained per week
const hoursPerWeekLabels = computed(() => weeksAgg.value.map(w => w.week));
const hoursPerWeekData = computed(() => weeksAgg.value.map(w => Number((((w.durationMin ?? 0) / 60)).toFixed(2))));

// Volume per week
const volumePerWeekData = computed(() => weeksAgg.value.map(w => Math.round(w.volumeKg ?? 0)));

// Reps/Sets per week
const repsPerWeekData = computed(() => weeksAgg.value.map(w => w.reps ?? 0));
const setsPerWeekData = computed(() => weeksAgg.value.map(w => w.sets ?? 0));

// Workout streak (weeks with >=1 workout)
const workoutStreakWeeks = computed(() => {
  // count consecutive weeks from latest going backward
  const arr = weeksAgg.value;
  let streak = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if ((arr[i]?.workouts ?? 0) > 0) streak++; else break;
  }
  return streak;
});

// Most trained exercise (by occurrences)
const mostTrainedExercise = computed(() => {
  const freq: Record<string, number> = {};
  for (const w of filteredByRange.value) {
    for (const ex of (w.exercises || [])) {
      const name = ex.title || "Unknown";
      freq[name] = (freq[name] || 0) + 1;
    }
  }
  let best = "-", max = 0;
  for (const [name, count] of Object.entries(freq)) {
    if (count > max) { max = count; best = name; }
  }
  return { name: best, count: max };
});

// Longest workout
const longestWorkout = computed(() => {
  let best: any = null; let bestDur = -1;
  for (const w of workouts.value) {
    const dur = Math.max(0, Math.floor(((w.end_time || w.start_time || 0) - (w.start_time || 0)) / 60));
    if (dur > bestDur) { bestDur = dur; best = w; }
  }
  return { workout: best, minutes: bestDur };
});

const fetchData = async () => {
  try {
    await store.fetchUserAccount();
    await store.fetchWorkouts();
    processChartData();
  } catch (error) {
    console.error("Error fetching data:", error);
  }
};

const processChartData = () => {
  const dates: string[] = [];
  const volumes: number[] = [];
  const muscleGroups: { [key: string]: number } = {};

  workouts.value.forEach((workout) => {
    const date = new Date(workout.start_time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dates.push(date);
    volumes.push(workout.estimated_volume_kg || 0);

    // Count muscle groups
    workout.exercises?.forEach((exercise: any) => {
      const muscleGroup = exercise.muscle_group || "Unknown";
      const setsCount = exercise.sets?.length || 0;
      muscleGroups[muscleGroup] = (muscleGroups[muscleGroup] || 0) + setsCount;
    });
  });

  chartData.value = {
    labels: dates.reverse(),
    datasets: [
      {
        label: "Volume (kg)",
        backgroundColor: "rgba(16, 185, 129, 0.2)",
        borderColor: "#10b981",
        borderWidth: 2,
        data: volumes.reverse(),
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const muscleGroupLabels = Object.keys(muscleGroups);
  const muscleGroupValues = Object.values(muscleGroups);

  muscleGroupData.value = {
    labels: muscleGroupLabels,
    datasets: [
      {
        data: muscleGroupValues,
        backgroundColor: [
          "#10b981",
          "#06b6d4",
          "#8b5cf6",
          "#f59e0b",
          "#ef4444",
          "#ec4899",
          "#14b8a6",
          "#f97316",
        ],
        borderWidth: 0,
      },
    ],
  };
};

const totalWorkouts = computed(() => workouts.value.length);
const totalVolume = computed(() =>
  workouts.value.reduce((sum, w) => sum + (w.estimated_volume_kg || 0), 0)
);
const avgVolume = computed(() =>
  totalWorkouts.value > 0 ? Math.round(totalVolume.value / totalWorkouts.value) : 0
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    y: {
      grid: {
        color: "#2b3553",
      },
      ticks: {
        color: "#9A9A9A",
      },
    },
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: "#9A9A9A",
      },
    },
  },
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "right" as const,
      labels: {
        color: "#9A9A9A",
        padding: 15,
        font: {
          size: 12,
        },
      },
    },
  },
};

onMounted(fetchData);
</script>

<!-- =============================================================================== -->

<template>
  <div class="dashboard">
    <!-- Header Section -->
    <div class="dashboard-header">
      <div class="header-content">
        <div class="title-section">
          <h1>Dashboard</h1>
          <p v-if="userAccount" class="subtitle">Welcome back, {{ userAccount.username }}!</p>
        </div>

        <!-- User Badge -->
        <div v-if="userAccount" class="user-badge">
          <div class="user-avatar">{{ userAccount.username.charAt(0).toUpperCase() }}</div>
          <div class="user-details">
            <strong>{{ userAccount.username }}</strong>
            <span>{{ userAccount.email }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading your workout data...</p>
    </div>

    <!-- Main Content -->
    <div v-else class="dashboard-content">
      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon workout-icon">🏋️</div>
          <div class="stat-content">
            <div class="stat-value">{{ totalWorkouts }}</div>
            <div class="stat-label">Total Workouts</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon volume-icon">💪</div>
          <div class="stat-content">
            <div class="stat-value">{{ totalVolume.toLocaleString() }}</div>
            <div class="stat-label">Total Volume (kg)</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon avg-icon">📊</div>
          <div class="stat-content">
            <div class="stat-value">{{ avgVolume.toLocaleString() }}</div>
            <div class="stat-label">Avg Volume (kg)</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🔥</div>
          <div class="stat-content">
            <div class="stat-value">{{ workoutStreakWeeks }}</div>
            <div class="stat-label">Workout Streak (Weeks)</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🏆</div>
          <div class="stat-content">
            <div class="stat-value">{{ mostTrainedExercise.name }}</div>
            <div class="stat-label">Most Trained Exercise</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">⏱️</div>
          <div class="stat-content">
            <div class="stat-value">{{ longestWorkout.minutes }} min</div>
            <div class="stat-label">Longest Workout</div>
          </div>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="charts-toolbar">
        <div class="filters">
          <label class="filter-label">Range</label>
          <select v-model="range" class="filter-select">
            <option value="1m">1 Month</option>
            <option value="3m">3 Months</option>
            <option value="6m">6 Months</option>
            <option value="1y">1 Year</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      <div class="charts-grid">
        <div class="chart-container large-chart">
          <div class="chart-header">
            <h2>Hours Trained Per Week</h2>
            <span class="chart-subtitle">Filtered by range</span>
          </div>
          <div class="chart-body">
            <Line :key="'hours-' + range" :data="{ labels: hoursPerWeekLabels, datasets: [{ label: 'Hours', data: hoursPerWeekData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.2)', fill: true, tension: 0.3 }] }" :options="chartOptions" />
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h2>Volume Per Week</h2>
            <span class="chart-subtitle">Filtered by range</span>
          </div>
          <div class="chart-body">
            <Line :key="'volume-' + range" :data="{ labels: hoursPerWeekLabels, datasets: [{ label: 'Volume (kg)', data: volumePerWeekData, borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.2)', fill: true, tension: 0.3 }] }" :options="chartOptions" />
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h2>Reps / Sets Per Week</h2>
            <span class="chart-subtitle">Filtered by range</span>
          </div>
          <div class="chart-body">
            <Line :key="'rs-' + range" :data="{ labels: hoursPerWeekLabels, datasets: [
              { label: 'Reps', data: repsPerWeekData, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.15)', fill: true, tension: 0.3 },
              { label: 'Sets', data: setsPerWeekData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.15)', fill: true, tension: 0.3 }
            ] }" :options="chartOptions" />
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h2>Muscle Distribution</h2>
            <span class="chart-subtitle">Total sets by muscle group</span>
          </div>
          <div class="chart-body doughnut-body">
            <Doughnut v-if="muscleGroupData" :data="muscleGroupData" :options="doughnutOptions" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<!-- =============================================================================== -->

<style scoped>
.dashboard {
  padding: 1.5rem 1.25rem; /* tighter top/bottom */
  width: 100%;
  min-height: 100vh;
  background: var(--bg-primary);
}

/* Header Styles */
.dashboard-header {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(16, 185, 129, 0.1);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.title-section h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 2rem; /* slightly smaller title text */
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #10b981, #06b6d4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 1rem;
  font-weight: 400;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--bg-card);
  padding: 0.75rem 1.25rem;
  border-radius: 50px;
  border: 1px solid rgba(16, 185, 129, 0.2);
  transition: all 0.3s ease;
}

.user-badge:hover {
  border-color: var(--emerald-primary);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.15);
}

.user-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 1.125rem;
  text-transform: uppercase;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.user-details strong {
  font-size: 0.95rem;
  color: var(--text-primary);
  font-weight: 600;
}

.user-details span {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

/* Loading State */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6rem 2rem;
  gap: 1.5rem;
}

.loading-spinner {
  width: 56px;
  height: 56px;
  border: 4px solid rgba(16, 185, 129, 0.1);
  border-top-color: var(--emerald-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-container p {
  color: var(--text-secondary);
  font-size: 1rem;
  margin: 0;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1rem; /* tighter spacing between cards */
  margin-bottom: 2rem; /* less bottom gap */
}

.stat-card {
  background: var(--bg-card);
  padding: 1.25rem 1rem; /* reduce padding top/bottom */
  border-radius: 16px;
  border: 1px solid rgba(16, 185, 129, 0.15);
  display: flex;
  align-items: center;
  gap: 0.9rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--emerald-primary), var(--cyan-accent));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  border-color: var(--emerald-primary);
  box-shadow: 0 12px 28px rgba(16, 185, 129, 0.15);
}

.stat-card:hover::before {
  opacity: 1;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
  background: rgba(16, 185, 129, 0.1);
  transition: transform 0.3s ease;
}

.stat-card:hover .stat-icon {
  transform: scale(1.1);
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 1.5rem; /* slightly smaller value text */
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
  line-height: 1.2;
}

.stat-label {
  color: var(--text-secondary);
  font-size: 0.8rem; /* slightly smaller label */
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Charts Grid */
.charts-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem; /* tighter spacing between charts */
}
.charts-toolbar { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
.filters { display: flex; align-items: center; gap: 0.5rem; }
.filter-label { color: var(--text-secondary); font-size: 0.85rem; }
.filter-select { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.4rem 0.6rem; }

.chart-container {
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid rgba(16, 185, 129, 0.15);
  overflow: hidden;
  transition: all 0.3s ease;
}

.chart-container:hover {
  border-color: var(--emerald-primary);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.12);
}

.chart-header {
  padding: 1rem 1.25rem; /* reduce top/bottom */
  border-bottom: 1px solid rgba(16, 185, 129, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(6, 182, 212, 0.05));
}

.chart-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.25px;
}

.chart-subtitle {
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
}

.chart-body {
  padding: 1.25rem 1rem; /* reduce padding */
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.doughnut-body {
  min-height: 340px;
}

/* Responsive Adjustments */
@media (min-width: 1024px) {
  .charts-grid {
    grid-template-columns: 2fr 1fr;
  }
  
  .large-chart {
    grid-column: span 1;
  }
}

@media (min-width: 1400px) {
  .dashboard {
    padding: 2rem 2.25rem; /* slightly tighter on xl */
  }
  
  .stats-grid {
    grid-template-columns: repeat(6, 1fr);
  }
}

@media (max-width: 768px) {
  .dashboard {
    padding: 1.5rem 1rem;
  }
  
  .title-section h1 {
    font-size: 1.875rem;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
  
  .stat-card {
    padding: 1.25rem;
  }
  
  .chart-body {
    padding: 1rem 0.75rem;
    min-height: 260px;
  }
  
  .doughnut-body {
    min-height: 300px;
  }
}

@media (max-width: 480px) {
  .dashboard {
    padding: 1rem;
  }
  
  .title-section h1 {
    font-size: 1.625rem;
  }
  
  .subtitle {
    font-size: 0.875rem;
  }
  
  .stat-value {
    font-size: 1.625rem;
  }
  
  .stat-icon {
    width: 48px;
    height: 48px;
    font-size: 1.5rem;
  }
  
  .user-avatar {
    width: 36px;
    height: 36px;
    font-size: 1rem;
  }
  
  .chart-header {
    padding: 1.25rem 1rem;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  
  .chart-body {
    padding: 1.25rem 0.75rem;
  }
}
</style>
