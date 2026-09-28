import { Feather } from "@expo/vector-icons";
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

export interface WalletListItemButtonPalette {
  backgroundColor: string;
  borderColor: string;
  installedNameColor: string;
  notInstalledNameColor: string;
  installedStatusColor: string;
  notInstalledStatusColor: string;
  installedIconColor: string;
  notInstalledIconColor: string;
}

interface WalletListItemButtonProps {
  name: string;
  isInstalled: boolean;
  onPress: () => void;
  palette: WalletListItemButtonPalette;
  iconSource?: ImageSourcePropType;
  iconTintColor?: string;
  installedLabel?: string;
  notInstalledLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function WalletListItemButton(props: WalletListItemButtonProps) {
  const {
    name,
    isInstalled,
    onPress,
    palette,
    iconSource,
    iconTintColor,
    installedLabel = "Installed",
    notInstalledLabel = "Install",
    style,
  } = props;

  const leftIconColor = isInstalled
    ? palette.installedIconColor
    : palette.notInstalledIconColor;

  return (
    <Pressable
      style={[
        styles.button,
        { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor },
        style,
      ]}
      onPress={onPress}
    >
      <View style={styles.content}>
        {iconSource ? (
          <Image
            source={iconSource}
            style={[
              styles.leftIconImage,
              iconTintColor ? { tintColor: iconTintColor } : null,
            ]}
            resizeMode="contain"
          />
        ) : null}
        <View style={styles.textGroup}>
          <Text
            style={[
              styles.name,
              { color: isInstalled ? palette.installedNameColor : palette.notInstalledNameColor },
            ]}
          >
            {name}
          </Text>
          <Text
            style={[
              styles.status,
              {
                color: isInstalled
                  ? palette.installedStatusColor
                  : palette.notInstalledStatusColor,
              },
            ]}
          >
            {isInstalled ? installedLabel : notInstalledLabel}
          </Text>
        </View>
        <Feather
          name={isInstalled ? "chevron-right" : "download"}
          size={isInstalled ? 22 : 18}
          color={leftIconColor}
        />
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
    gap: 12,
  },
  leftIconImage: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
  },
  status: {
    fontSize: 12,
    fontWeight: "500",
  },
});
