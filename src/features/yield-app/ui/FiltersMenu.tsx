import { Pressable, View } from "react-native";
import Animated, { FadeOut, ZoomIn } from "react-native-reanimated";
import { Tap } from "./Tap";
import { T } from "./Text";
import { IconCheck, IconFilters } from "./icons";
import { C, shadow } from "./theme";

export type FilterOption = { id: string; label: string; hint: string; on: boolean };

export function FiltersButton({ open, setOpen, active }: { open: boolean; setOpen: (v: boolean) => void; active: boolean }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Filters"
      accessibilityState={{ expanded: open }}
      feedback="select"
      scale={0.92}
      onPress={() => setOpen(!open)}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: active ? C.blue : C.raised }}
    >
      <IconFilters sw={2.2} color={active ? C.white : C.ink} />
    </Tap>
  );
}

/**
 * iOS-style pull-down "Show" menu with checkmarks. Rendered as a screen overlay so it
 * floats above the list; `top` is where the Filters button ends.
 */
export function FiltersMenu({ open, setOpen, options, onToggle, top }: { open: boolean; setOpen: (v: boolean) => void; options: FilterOption[]; onToggle: (id: string) => void; top: number }) {
  if (!open) return null;
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}>
      <Pressable accessibilityLabel="Close filters" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setOpen(false)} />
      <Animated.View
        accessibilityRole="menu"
        accessibilityLabel="Show"
        entering={ZoomIn.springify().damping(30).stiffness(500).withInitialValues({ opacity: 0, transform: [{ scale: 0.9 }] })}
        exiting={FadeOut.duration(120)}
        style={[
          { position: "absolute", right: 20, top, width: 264, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.98)", transformOrigin: "top right" },
          shadow.menu,
        ]}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
          <T size={12} color={C.ink4}>
            Show
          </T>
        </View>
        {options.map((o, i) => (
          <Tap
            key={o.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: o.on }}
            feedback="select"
            scale={1}
            bg="transparent"
            pressedBg={C.surface}
            onPress={() => onToggle(o.id)}
            style={{
              height: 46,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              borderTopWidth: 0.5,
              borderColor: C.line,
              borderBottomLeftRadius: i === options.length - 1 ? 14 : 0,
              borderBottomRightRadius: i === options.length - 1 ? 14 : 0,
            }}
          >
            <View style={{ width: 18, alignItems: "center", opacity: o.on ? 1 : 0 }}>
              <IconCheck size={16} sw={3} color={C.blue} />
            </View>
            <T size={16} style={{ flex: 1 }}>
              {o.label}
            </T>
            <T size={13} color={C.ink4}>
              {o.hint}
            </T>
          </Tap>
        ))}
      </Animated.View>
    </View>
  );
}
