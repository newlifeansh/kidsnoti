import { getTossShareLink, share } from "@apps-in-toss/web-framework";

const APP_IN_TOSS_NAME = "kidsnoti";

export interface FamilyInviteShareResult {
  fallbackInviteLink?: string;
}

function hasFinalConsonant(text: string) {
  const lastCharacter = [...text.trim()].at(-1);
  if (!lastCharacter) return false;

  const code = lastCharacter.charCodeAt(0);
  const firstHangulCode = 0xac00;
  const lastHangulCode = 0xd7a3;
  if (code < firstHangulCode || code > lastHangulCode) {
    return false;
  }

  return (code - firstHangulCode) % 28 !== 0;
}

export function createFamilyInviteMessage(inviteLink: string, invitedDisplayName?: string) {
  const name = invitedDisplayName?.trim();
  const copy = name
    ? `알림장쏙에서 ${name}${hasFinalConsonant(name) ? "으로" : "로"} 함께할 수 있게 초대했어요.`
    : "알림장쏙에서 우리 아이 준비물과 일정을 같이 확인해요.";

  return [copy, inviteLink].join("\n");
}

export async function shareFamilyInvite(
  inviteCode: string,
  invitedDisplayName?: string,
): Promise<FamilyInviteShareResult> {
  const inviteQuery = new URLSearchParams({
    code: inviteCode,
  });
  if (invitedDisplayName?.trim()) {
    inviteQuery.set("name", invitedDisplayName.trim());
  }

  const invitePath = `intoss://${APP_IN_TOSS_NAME}/invite?${inviteQuery.toString()}`;
  const inviteLink = await createInviteLink(invitePath);
  const browserInviteLink = `${window.location.origin}/invite?${inviteQuery.toString()}`;
  const resolvedInviteLink = inviteLink || browserInviteLink;
  const message = createFamilyInviteMessage(resolvedInviteLink, invitedDisplayName);

  try {
    await share({ message });
    return {};
  } catch {
    // Local browser does not provide the Apps in Toss native share bridge.
  }

  if (navigator.share) {
    await navigator.share({
      title: "알림장쏙 가족 초대",
      text: message,
      url: resolvedInviteLink,
    });
    return {};
  }

  try {
    await navigator.clipboard.writeText(message);
    window.alert("초대 링크를 클립보드에 복사했어요.");
    return {};
  } catch {
    return {
      fallbackInviteLink: resolvedInviteLink,
    };
  }
}

async function createInviteLink(invitePath: string) {
  try {
    return await getTossShareLink(invitePath);
  } catch {
    return invitePath.replace(`intoss://${APP_IN_TOSS_NAME}`, window.location.origin);
  }
}
