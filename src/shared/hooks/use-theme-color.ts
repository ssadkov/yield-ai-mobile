import { Colors } from "@/shared/constants";
import { useColorScheme } from "@/shared/hooks/use-color-scheme";

export function useThemeColor(
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark,
) {
  const theme = useColorScheme() ?? "light";
  return Colors[theme][colorName];
}
