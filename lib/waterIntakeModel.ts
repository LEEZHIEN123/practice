import modelJson from "./waterIntakeModel.json";

export type WaterWeatherCondition = "sunny" | "cloudy" | "rainy";
export type WaterActivityLevel = "low" | "medium" | "high";

export type WaterIntakeModelInput = {
  gender: "Male" | "Female";
  weather_condition: WaterWeatherCondition;
  activity_level: WaterActivityLevel;
  age: number;
  weight: number;
  height: number;
  BMI: number;
  temperature: number;
  humidity: number;
  altitude: number;
  activity_duration: number;
};

type TreeExport = {
  children_left: number[];
  children_right: number[];
  feature: number[];
  threshold: number[];
  value: number[];
};

type ModelExport = {
  numMedians: number[];
  catCategories: string[][];
  learningRate: number;
  init: number;
  trees: TreeExport[];
};

const model = modelJson as ModelExport;

function buildFeatureVector(input: WaterIntakeModelInput): number[] {
  const numerical = [
    input.age,
    input.weight,
    input.height,
    input.BMI,
    input.temperature,
    input.humidity,
    input.altitude,
    input.activity_duration,
  ].map((value, index) =>
    Number.isFinite(value) ? value : model.numMedians[index]
  );

  const categoricalValues = [
    input.gender,
    input.weather_condition,
    input.activity_level,
  ];

  const categorical: number[] = [];
  model.catCategories.forEach((categories, index) => {
    const value = categoricalValues[index];
    categories.forEach((category) => {
      categorical.push(category === value ? 1 : 0);
    });
  });

  return [...numerical, ...categorical];
}

function predictTree(tree: TreeExport, features: number[]): number {
  let node = 0;
  while (tree.children_left[node] !== -1) {
    const featureIndex = tree.feature[node];
    const threshold = tree.threshold[node];
    const value = features[featureIndex] ?? 0;
    node = value <= threshold ? tree.children_left[node] : tree.children_right[node];
  }
  return tree.value[node];
}

/** Predict daily water intake in liters (model target unit). */
export function predictWaterIntakeLiters(input: WaterIntakeModelInput): number {
  const features = buildFeatureVector(input);
  let prediction = model.init;
  for (const tree of model.trees) {
    prediction += model.learningRate * predictTree(tree, features);
  }
  return Math.max(1.5, Math.min(8, prediction));
}

/** Predict daily water intake in milliliters, rounded to nearest 50 ml. */
export function predictWaterIntakeMl(input: WaterIntakeModelInput): number {
  const liters = predictWaterIntakeLiters(input);
  const ml = liters * 1000;
  return Math.round(ml / 50) * 50;
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  if (!heightM) return 0;
  return Number((weightKg / (heightM * heightM)).toFixed(2));
}
