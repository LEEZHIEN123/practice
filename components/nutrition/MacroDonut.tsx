import { Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

const CARBS_COLOR = "#3B82F6";
const FAT_COLOR = "#F472B6";
const PROTEIN_COLOR = "#F4D03F";

type MacroDonutProps = {
  proteinG: number;
  carbsG: number;
  fatG: number;
  calories: number;
  size?: number;
  strokeWidth?: number;
};

export function MacroDonut({
  proteinG,
  carbsG,
  fatG,
  calories,
  size = 104,
  strokeWidth = 11,
}: MacroDonutProps) {
  const proteinCal = proteinG * 4;
  const carbsCal = carbsG * 4;
  const fatCal = fatG * 9;
  const macroTotal = proteinCal + carbsCal + fatCal || calories || 1;

  const carbsPct = Math.round((carbsCal / macroTotal) * 100);
  const fatPct = Math.round((fatCal / macroTotal) * 100);
  const proteinPct = Math.max(0, 100 - carbsPct - fatPct);

  const cx = size / 2;
  const cy = size / 2;
  const r = Math.max(1, (size - strokeWidth) / 2 - 1);
  const circumference = 2 * Math.PI * r;

  const carbsAngle = 360 * (carbsCal / macroTotal);
  const fatAngle = 360 * (fatCal / macroTotal);
  const proteinAngle = 360 * (proteinCal / macroTotal);

  const carbsLen = circumference * (carbsAngle / 360);
  const fatLen = circumference * (fatAngle / 360);
  const proteinLen = circumference * (proteinAngle / 360);

  return (
    <View className="flex-row items-center">
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G transform={`rotate(-90 ${cx} ${cy})`}>
            <Circle cx={cx} cy={cy} r={r} stroke="#eceff3" strokeWidth={strokeWidth} fill="none" />
            {carbsLen > 0.5 ? (
              <Circle
                cx={cx}
                cy={cy}
                r={r}
                stroke={CARBS_COLOR}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${carbsLen} ${circumference}`}
                strokeLinecap="butt"
              />
            ) : null}
            {fatLen > 0.5 ? (
              <G transform={`rotate(${carbsAngle} ${cx} ${cy})`}>
                <Circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={FAT_COLOR}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${fatLen} ${circumference}`}
                  strokeLinecap="butt"
                />
              </G>
            ) : null}
            {proteinLen > 0.5 ? (
              <G transform={`rotate(${carbsAngle + fatAngle} ${cx} ${cy})`}>
                <Circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={PROTEIN_COLOR}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${proteinLen} ${circumference}`}
                  strokeLinecap="butt"
                />
              </G>
            ) : null}
          </G>
        </Svg>
        <View className="absolute items-center justify-center">
          <Text className="text-xl font-extrabold text-gray-900">{Math.round(calories)}</Text>
          <Text className="text-[10px] font-bold text-gray-500">Cal</Text>
        </View>
      </View>

      <View className="flex-1 ml-3 flex-row justify-between">
        <MacroCol color={CARBS_COLOR} pct={carbsPct} grams={carbsG} label="Carbs" />
        <MacroCol color={FAT_COLOR} pct={fatPct} grams={fatG} label="Fat" />
        <MacroCol color={PROTEIN_COLOR} pct={proteinPct} grams={proteinG} label="Protein" />
      </View>
    </View>
  );
}

function MacroCol({
  color,
  pct,
  grams,
  label,
}: {
  color: string;
  pct: number;
  grams: number;
  label: string;
}) {
  return (
    <View className="flex-1 items-center px-1">
      <View className="flex-row items-center mb-1">
        <View className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: color }} />
        <Text className="text-[10px] font-bold text-gray-500">{pct}%</Text>
      </View>
      <Text className="text-sm font-extrabold text-gray-900 text-center">
        {grams.toFixed(1)}g
      </Text>
      <Text className="text-[11px] font-bold text-gray-500 text-center mt-0.5">{label}</Text>
    </View>
  );
}
