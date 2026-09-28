import * as Haptics from "expo-haptics";

const safe = (p: Promise<unknown>) => {
  p.catch(() => {});
};

export const haptic = {
  tap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => safe(Haptics.selectionAsync()),
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
