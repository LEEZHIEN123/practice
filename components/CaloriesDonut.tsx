import Svg, { Circle, G } from "react-native-svg";

type Props = {
  goal: number;
  food: number;
  exercise: number;
  size?: number;
  strokeWidth?: number;
};

/**
 * Donut track = daily goal. Orange arc = food (goal share), green arc = exercise (goal share), clockwise from 12 o’clock.
 * If food + exercise arcs exceed a full turn, they are scaled so both stay visible.
 */
export function CaloriesDonut({ goal, food, exercise, size = 120, strokeWidth = 10 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = Math.max(1, (size - strokeWidth) / 2 - 1);
  const C = 2 * Math.PI * r;

  let foodAngle = 0;
  let exAngle = 0;
  if (goal > 0) {
    foodAngle = Math.min((360 * food) / goal, 360);
    exAngle = Math.min((360 * exercise) / goal, 360);
    const sum = foodAngle + exAngle;
    if (sum > 360 && sum > 0) {
      const f = 360 / sum;
      foodAngle *= f;
      exAngle *= f;
    }
  }

  const orangeLen = C * (foodAngle / 360);
  const greenLen = C * (exAngle / 360);

  const showOrange = goal > 0 && food > 0 && orangeLen > 0.5;
  const showGreen = goal > 0 && exercise > 0 && greenLen > 0.5;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G transform={`rotate(-90 ${cx} ${cy})`}>
        <Circle cx={cx} cy={cy} r={r} stroke="#e5e7eb" strokeWidth={strokeWidth} fill="none" />
        {showOrange && (
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="#f97316"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${orangeLen} ${C}`}
            strokeLinecap="round"
          />
        )}
        {showGreen && (
          <G transform={`rotate(${foodAngle} ${cx} ${cy})`}>
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke="#22c55e"
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${greenLen} ${C}`}
              strokeLinecap="round"
            />
          </G>
        )}
      </G>
    </Svg>
  );
}
