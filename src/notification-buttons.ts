// The buttons on the instance's push notifications (lib/notification-actions.ts
// and lib/notification-targets.ts in Flowplan): which category has which
// buttons, and what a tapped button asks the instance to do. Pure functions –
// src/native/notification-actions.ts registers and answers them.

// The categories the instance names in its pushes; the ids must stay.
export const CATEGORIES = {
  task: "flowplan.task",
  comment: "flowplan.comment",
  read: "flowplan.read",
  // An open workflow approval (docs/specs/workflows.md §11.8 in Flowplan).
  approval: "flowplan.workflow-approval",
} as const;

// The buttons' identifiers (also known to modules/flowplan-notify on iOS)
// and the action the instance knows them by.
export const BUTTONS = {
  "fp.done": "done",
  "fp.tomorrow": "tomorrow",
  "fp.reply": "reply",
  "fp.read": "read",
  "fp.approve": "approve",
  "fp.reject": "reject",
} as const;
export type ButtonId = keyof typeof BUTTONS;
export type ButtonAction = (typeof BUTTONS)[ButtonId];

export const isButton = (identifier: unknown): identifier is ButtonId => typeof identifier === "string" && Object.prototype.hasOwnProperty.call(BUTTONS, identifier);

type Texts = { done: string; tomorrow: string; reply: string; send: string; placeholder: string; read: string; approve: string; reject: string };
export type CategoryButton = {
  identifier: ButtonId;
  buttonTitle: string;
  textInput?: { submitButtonTitle: string; placeholder: string };
  options: { opensAppToForeground: boolean; isAuthenticationRequired: boolean; isDestructive?: boolean };
};

// "Approve" is the one button that opens the app: it is confirmed there with
// Face ID / Touch ID / the fingerprint before anything is sent (native/
// approvals.ts) – iOS gives a background button no way to ask for that.
export const opensApp = (identifier: unknown) => identifier === "fp.approve";

// The other buttons work without opening the app. Those that change
// something in the person's name want the phone unlocked (iOS); "Mark as
// read" does not.
export function categoryButtons(texts: Texts): { identifier: string; actions: CategoryButton[] }[] {
  const button = (identifier: ButtonId, buttonTitle: string, extra: Partial<CategoryButton> = {}): CategoryButton => ({
    identifier,
    buttonTitle,
    options: { opensAppToForeground: opensApp(identifier), isAuthenticationRequired: identifier !== "fp.read" },
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
    {
      identifier: CATEGORIES.approval,
      actions: [
        button("fp.approve", texts.approve),
        button("fp.reject", texts.reject, { options: { opensAppToForeground: false, isAuthenticationRequired: true, isDestructive: true } }),
      ],
    },
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

export type ButtonRequest = { action: Exclude<ButtonAction, "approve">; notificationId: string; text?: string; today?: string; approvalId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const approvalIdOf = (data: Record<string, unknown>) => (typeof data.approvalId === "string" && UUID.test(data.approvalId) ? data.approvalId : null);

// What a tapped button asks the instance (POST /api/mobile/notifications);
// null for anything else (a tap on the notification, a reply without text).
export function buttonRequest(response: Response | null | undefined, today: string): ButtonRequest | null {
  const identifier = typeof response?.actionIdentifier === "string" ? response.actionIdentifier : "";
  if (!isButton(identifier)) return null;
  const notificationId = notificationData(response).notificationId;
  if (typeof notificationId !== "string" || !notificationId) return null;
  const action = BUTTONS[identifier];
  // "Approve" is answered in the app after the confirmation (approvalRequest).
  if (action === "approve") return null;
  if (action === "reject") {
    const approvalId = approvalIdOf(notificationData(response));
    return approvalId ? { action, notificationId, approvalId } : { action, notificationId };
  }
  if (action === "reply") {
    const text = typeof response?.userText === "string" ? response.userText.trim() : "";
    return text ? { action, notificationId, text: text.slice(0, 5000) } : null;
  }
  return action === "tomorrow" ? { action, notificationId, today } : { action, notificationId };
}

// "Approve" tapped: what the app confirms and then asks the instance
// (POST /api/mobile/notifications { action: "approve", notificationId,
// approvalId, confirmation }), and the link to the approval view to open
// instead when that does not work; null for anything else.
export type ApprovalTap = { notificationId: string; approvalId: string; url: string | null; origin: string | null };
export function approvalRequest(response: Response | null | undefined): ApprovalTap | null {
  if (response?.actionIdentifier !== "fp.approve") return null;
  const data = notificationData(response);
  const approvalId = approvalIdOf(data);
  if (typeof data.notificationId !== "string" || !data.notificationId || !approvalId) return null;
  return {
    notificationId: data.notificationId,
    approvalId,
    url: typeof data.url === "string" ? data.url : null,
    origin: typeof data.origin === "string" ? data.origin : null,
  };
}
