import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export interface EcosystemChoiceButtonPalette {
  backgroundColor: string;
  borderColor: string;
  titleColor: string;
  subtitleColor: string;
  arrowColor?: string;
}

interface EcosystemChoiceButtonProps {
  title: string;
  subtitle: string;
  icon: ImageSourcePropType;
  onPress: () => void;
  palette: EcosystemChoiceButtonPalette;
  style?: StyleProp<ViewStyle>;
}

export function EcosystemChoiceButton(props: EcosystemChoiceButtonProps) {
  const { title, subtitle, icon, onPress, palette, style } = props;
  const arrowColor = palette.arrowColor ?? palette.titleColor;

  return (
    <Pressable
      style={[
        styles.button,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
        style,
      ]}
      onPress={onPress}
    >
      <View style={styles.content}>
        <Image source={icon} style={styles.logo} />
        <View style={styles.textGroup}>
          <Text style={[styles.title, { color: palette.titleColor }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: palette.subtitleColor }]}>
            {subtitle}
          </Text>
        </View>
        <Text style={[styles.arrow, { color: arrowColor }]}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
  },
  arrow: {
    fontSize: 28,
    lineHeight: 28,
    marginTop: -2,
  },
});
