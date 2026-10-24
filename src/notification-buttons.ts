// The buttons on the instance's push notifications (lib/notification-actions.ts
// and lib/notification-targets.ts in Flowplan): which category has which
// buttons, and what a tapped button asks the instance to do. Pure functions –
// src/native/notification-actions.ts registers and answers them.

// The categories the instance names in its pushes; the ids must stay.
export const CATEGORIES = {
  task: "flowplan.task",
  comment: "flowplan.comment",
  read: "flowplan.read",
} as const;

// The buttons' identifiers (also known to modules/flowplan-notify on iOS)
// and the action the instance knows them by.
export const BUTTONS = {
  "fp.done": "done",
  "fp.tomorrow": "tomorrow",
  "fp.reply": "reply",
  "fp.read": "read",
} as const;
export type ButtonId = keyof typeof BUTTONS;
export type ButtonAction = (typeof BUTTONS)[ButtonId];

export const isButton = (identifier: unknown): identifier is ButtonId => typeof identifier === "string" && Object.prototype.hasOwnProperty.call(BUTTONS, identifier);

type Texts = { done: string; tomorrow: string; reply: string; send: string; placeholder: string; read: string };
export type CategoryButton = {
  identifier: ButtonId;
  buttonTitle: string;
  textInput?: { submitButtonTitle: string; placeholder: string };
  options: { opensAppToForeground: false; isAuthenticationRequired: boolean };
};

// All buttons work without opening the app. Those that change something in
// the person's name want the phone unlocked (iOS); "Mark as read" does not.
export function categoryButtons(texts: Texts): { identifier: string; actions: CategoryButton[] }[] {
  const button = (identifier: ButtonId, buttonTitle: string, extra: Partial<CategoryButton> = {}): CategoryButton => ({
    identifier,
    buttonTitle,
    options: { opensAppToForeground: false, isAuthenticationRequired: identifier !== "fp.read" },
    ...extra,
  });
  const read = button("fp.read", texts.read);
  return [
    { identifier: CATEGORIES.task, actions: [button("fp.done", texts.done), button("fp.tomorrow", texts.tomorrow)] },
    {
      identifier: CATEGORIES.comment,
      actions: [button("fp.reply", texts.reply, { textInput: { submitButtonTitle: texts.send, placeholder: texts.placeholder } }), read],
    },
    { identifier: CATEGORIES.read, actions: [read] },
  ];
}

type Response = {
  actionIdentifier?: unknown;
  userText?: unknown;
  notification?: { request?: { identifier?: unknown; content?: { data?: unknown; dataString?: unknown } } };
};

const parse = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    return parse(JSON.parse(value));
  } catch {
    return null;
  }
};

// The `data` the instance sent (url, notificationId). expo-notifications
// hands it over parsed; Android's background task may bring it as text, or
// still wrapped in the push's "body".
export function notificationData(response: Response | null | undefined): Record<string, unknown> {
  const content = response?.notification?.request?.content;
  const data = parse(content?.data) ?? parse(content?.dataString) ?? {};
  const body = typeof data.body === "string" ? parse(data.body) : null;
  return body && "notificationId" in body ? body : data;
}

export type ButtonRequest = { action: ButtonAction; notificationId: string; text?: string; today?: string };

// What a tapped button asks the instance (POST /api/mobile/notifications);
// null for anything else (a tap on the notification, a reply without text).
export function buttonRequest(response: Response | null | undefined, today: string): ButtonRequest | null {
  const identifier = typeof response?.actionIdentifier === "string" ? response.actionIdentifier : "";
  if (!isButton(identifier)) return null;
  const notificationId = notificationData(response).notificationId;
  if (typeof notificationId !== "string" || !notificationId) return null;
  const action = BUTTONS[identifier];
  if (action === "reply") {
    const text = typeof response?.userText === "string" ? response.userText.trim() : "";
    return text ? { action, notificationId, text: text.slice(0, 5000) } : null;
  }
  return action === "tomorrow" ? { action, notificationId, today } : { action, notificationId };
}
