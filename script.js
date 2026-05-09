// Paste your Firebase web app config here from the Firebase console.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const appRoot = document.getElementById("app");
const sessionId = getSessionId();
const appReady = typeof firebase !== "undefined";
const firebaseReady = appReady && isFirebaseConfigReady(firebaseConfig);

const storageKeys = {
  displayName: "unisend-name",
  activeType: "unisend-chat-type",
  activeId: "unisend-chat-id",
  activeLabel: "unisend-chat-label",
  activePeerId: "unisend-chat-peer-id",
};

const appState = {
  authUser: null,
  profile: null,
  contacts: [],
  activeChat: loadActiveChat(),
  previewMessages: [],
};

let db = null;
let auth = null;
let unsubscribeMessages = null;
let unsubscribeContacts = null;
let authReady = false;

appRoot.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">U</div>
        <div>
          <p class="eyebrow">Realtime Messenger</p>
          <h1>UniSend</h1>
        </div>
      </div>

      <section class="panel">
        <h2>Account</h2>
        <p id="authState" class="hint">Checking authentication...</p>
        <label class="field">
          <span>Email</span>
          <input id="emailInput" type="email" autocomplete="email" placeholder="you@example.com">
        </label>
        <label class="field">
          <span>Password</span>
          <input id="passwordInput" type="password" autocomplete="current-password" placeholder="Minimum 6 characters">
        </label>
        <div class="auth-actions">
          <button id="signInBtn" class="button button-secondary" type="button">Sign in</button>
          <button id="signUpBtn" class="button button-primary" type="button">Create account</button>
        </div>
        <button id="signOutBtn" class="button button-ghost" type="button">Sign out</button>
      </section>

      <section class="panel">
        <h2>Profile</h2>
        <label class="field">
          <span>Display name</span>
          <input id="nameInput" type="text" maxlength="32" placeholder="Your name">
        </label>
        <div class="auth-actions">
          <button id="saveNameBtn" class="button button-secondary" type="button">Save name</button>
          <span id="profileHint" class="hint">Use this name across rooms and private chats.</span>
        </div>
      </section>

      <section class="panel">
        <h2>Public Rooms</h2>
        <div class="room-list" id="roomList">
          <button class="room" data-room="public-lobby" data-label="Public Lobby" type="button">Public Lobby</button>
          <button class="room" data-room="product-updates" data-label="Product Updates" type="button">Product Updates</button>
          <button class="room" data-room="campus-chat" data-label="Campus Chat" type="button">Campus Chat</button>
        </div>
        <label class="field">
          <span>Join room</span>
          <input id="roomInput" type="text" maxlength="40" placeholder="custom-room">
        </label>
        <button id="joinRoomBtn" class="button button-primary" type="button">Join room</button>
      </section>

      <section class="panel">
        <h2>Contacts</h2>
        <label class="field">
          <span>Add by email</span>
          <input id="contactEmailInput" type="email" placeholder="friend@example.com">
        </label>
        <div class="auth-actions">
          <button id="addContactBtn" class="button button-secondary" type="button">Add contact</button>
          <span id="contactHint" class="hint">Private chats start from saved contacts.</span>
        </div>
        <div id="contactList" class="contact-list"></div>
      </section>

      <section class="panel status-panel">
        <h2>Firebase Setup</h2>
        <p id="connectionState">Firebase config not yet connected.</p>
        <p id="syncState">Preview mode.</p>
        <p class="hint">
          Enable Email/Password Authentication and Firestore in your Firebase project, then replace the values in the firebaseConfig block in script.js.
        </p>
      </section>
    </aside>

    <section class="chat-card">
      <header class="chat-header">
        <div>
          <p class="eyebrow" id="chatTypeLabel">Public room</p>
          <h2 id="chatTitle">Public Lobby</h2>
        </div>
        <div class="chat-meta">
          <span id="messageCount">0 messages</span>
          <span class="dot"></span>
          <span id="chatState">Offline preview</span>
        </div>
      </header>

      <div class="messages" id="messages"></div>

      <form class="composer" id="messageForm">
        <textarea id="messageInput" rows="3" maxlength="1000" placeholder="Write a message..."></textarea>
        <div class="composer-actions">
          <p id="composerHint">Sign in to send private messages or use preview mode locally.</p>
          <button id="sendBtn" class="button button-primary" type="submit">Send</button>
        </div>
      </form>
    </section>
  </main>
`;

const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const signInBtn = document.getElementById("signInBtn");
const signUpBtn = document.getElementById("signUpBtn");
const signOutBtn = document.getElementById("signOutBtn");
const authState = document.getElementById("authState");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const profileHint = document.getElementById("profileHint");
const roomInput = document.getElementById("roomInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomList = document.getElementById("roomList");
const contactEmailInput = document.getElementById("contactEmailInput");
const addContactBtn = document.getElementById("addContactBtn");
const contactHint = document.getElementById("contactHint");
const contactList = document.getElementById("contactList");
const connectionState = document.getElementById("connectionState");
const syncState = document.getElementById("syncState");
const chatTypeLabel = document.getElementById("chatTypeLabel");
const chatTitle = document.getElementById("chatTitle");
const chatState = document.getElementById("chatState");
const messageCount = document.getElementById("messageCount");
const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const composerHint = document.getElementById("composerHint");
const sendBtn = document.getElementById("sendBtn");

nameInput.value = loadSetting(storageKeys.displayName, `Guest-${sessionId.slice(-4)}`);
renderActiveChat();
renderMessages([]);
renderContacts([]);
setControlsEnabled(true);

if (firebaseReady) {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  db = firebase.firestore();
  auth = firebase.auth();
  connectionState.textContent = "Firebase connected";
  syncState.textContent = "Authenticating...";

  auth.onAuthStateChanged(async (user) => {
    authReady = true;
    appState.authUser = user;

    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }

    if (unsubscribeContacts) {
      unsubscribeContacts();
      unsubscribeContacts = null;
    }

    if (user) {
      await ensureUserProfile(user);
      subscribeContacts(user.uid);
      setStatus(`Signed in as ${displayNameFor(user)}`);
      authState.textContent = `Signed in as ${displayNameFor(user)}`;
      syncState.textContent = "Live sync enabled";
      composerHint.textContent = "Messages sync instantly through Firestore.";
      setControlsEnabled(true);
    } else {
      appState.profile = null;
      authState.textContent = "Signed out";
      syncState.textContent = "Public preview available";
      composerHint.textContent = "Sign in to use private chats. Public room preview remains available.";
      setControlsEnabled(true);
      if (appState.activeChat.type === "private") {
        setActiveChat({
          type: "room",
          id: "public-lobby",
          label: "Public Lobby",
          peerId: "",
        });
      }
    }

    subscribeCurrentChat();
    renderContacts(appState.contacts);
    renderActiveChat();
    updateComposerState();
  });
} else {
  authState.textContent = "Firebase config is missing";
  connectionState.textContent = "Preview mode";
  syncState.textContent = "Local only";
  composerHint.textContent = "Paste your Firebase config into script.js to enable auth and realtime chat.";
  renderPreviewMessages();
}

signInBtn.addEventListener("click", async () => {
  if (!firebaseReady) return;
  await withStatus("Signing in...", async () => {
    await auth.signInWithEmailAndPassword(emailInput.value.trim(), passwordInput.value);
  });
});

signUpBtn.addEventListener("click", async () => {
  if (!firebaseReady) return;
  await withStatus("Creating your account...", async () => {
    const result = await auth.createUserWithEmailAndPassword(emailInput.value.trim(), passwordInput.value);
    if (nameInput.value.trim()) {
      await result.user.updateProfile({ displayName: nameInput.value.trim() });
    }
  });
});

signOutBtn.addEventListener("click", async () => {
  if (!firebaseReady) return;
  await withStatus("Signing out...", async () => {
    await auth.signOut();
  });
});

saveNameBtn.addEventListener("click", async () => {
  const nextName = nameInput.value.trim() || `Guest-${sessionId.slice(-4)}`;
  nameInput.value = nextName;
  saveSetting(storageKeys.displayName, nextName);

  if (firebaseReady && auth && auth.currentUser) {
    await auth.currentUser.updateProfile({ displayName: nextName });
    await db.collection("users").doc(auth.currentUser.uid).set(
      {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || "",
        emailLower: (auth.currentUser.email || "").toLowerCase(),
        displayName: nextName,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  profileHint.textContent = `Saved as ${nextName}.`;
});

joinRoomBtn.addEventListener("click", () => {
  const nextRoom = sanitizeRoomId(roomInput.value.trim());
  if (!nextRoom) return;
  setActiveChat({
    type: "room",
    id: nextRoom,
    label: formatRoomLabel(nextRoom),
    peerId: "",
  });
  roomInput.value = "";
});

roomList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-room]");
  if (!button) return;
  setActiveChat({
    type: "room",
    id: button.dataset.room,
    label: button.dataset.label || formatRoomLabel(button.dataset.room),
    peerId: "",
  });
});

addContactBtn.addEventListener("click", async () => {
  if (!firebaseReady || !auth || !auth.currentUser) {
    contactHint.textContent = "Sign in first to save contacts.";
    return;
  }

  const email = contactEmailInput.value.trim().toLowerCase();
  if (!email) return;

  await withStatus("Looking up contact...", async () => {
    const snapshot = await db.collection("users").where("emailLower", "==", email).limit(1).get();
    if (snapshot.empty) {
      contactHint.textContent = "No user profile found for that email yet.";
      return;
    }

    const contactDoc = snapshot.docs[0];
    if (!auth || !auth.currentUser) {
      contactHint.textContent = "Sign in first to save contacts.";
      return;
    }

    if (contactDoc.id === auth.currentUser.uid) {
      contactHint.textContent = "You cannot add yourself as a contact.";
      return;
    }

    const contact = contactDoc.data();
    const conversationId = getPrivateConversationId(auth.currentUser.uid, contactDoc.id);

    await db.collection("users").doc(auth.currentUser.uid).collection("contacts").doc(contactDoc.id).set(
      {
        contactUid: contactDoc.id,
        contactEmail: contact.email || "",
        contactEmailLower: (contact.email || "").toLowerCase(),
        contactName: contact.displayName || contact.email || "Unknown",
        conversationId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    contactEmailInput.value = "";
    contactHint.textContent = `Added ${contact.displayName || contact.email || "contact"}.`;
  });
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  if (firebaseReady && (!auth || !auth.currentUser)) {
    composerHint.textContent = "Sign in to send messages.";
    return;
  }

  if (firebaseReady && db && auth && auth.currentUser) {
    await withStatus("Sending message...", async () => {
      await currentMessagesRef().add({
        text,
        senderId: auth.currentUser.uid,
        senderName: displayNameFor(auth.currentUser),
        senderEmail: auth.currentUser.email || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        roomType: appState.activeChat.type,
      });
    });
    messageInput.value = "";
    return;
  }

  appState.previewMessages.push({
    id: `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    senderId: sessionId,
    senderName: nameInput.value.trim() || `Guest-${sessionId.slice(-4)}`,
    createdAt: new Date(),
    roomType: appState.activeChat.type,
  });
  messageInput.value = "";
  renderPreviewMessages();
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

function setControlsEnabled(enabled) {
  [emailInput, passwordInput, signInBtn, signUpBtn, signOutBtn, saveNameBtn, roomInput, joinRoomBtn, contactEmailInput, addContactBtn, messageInput, sendBtn].forEach(
    (element) => {
      element.disabled = !enabled && element !== messageInput;
    }
  );
}

function setStatus(message) {
  connectionState.textContent = message;
}

async function withStatus(message, action) {
  setStatus(message);
  try {
    await action();
  } catch (error) {
    console.error(error);
    setStatus(readableFirebaseError(error));
  }
}

async function ensureUserProfile(user) {
  const profileRef = db.collection("users").doc(user.uid);
  const snapshot = await profileRef.get();
  const fallbackName = nameInput.value.trim() || user.displayName || user.email?.split("@")[0] || `Guest-${sessionId.slice(-4)}`;
  const profile = {
    uid: user.uid,
    email: user.email || "",
    emailLower: (user.email || "").toLowerCase(),
    displayName: fallbackName,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (!snapshot.exists) {
    profile.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  } else {
    const existing = snapshot.data() || {};
    profile.displayName = existing.displayName || profile.displayName;
  }

  await profileRef.set(profile, { merge: true });
  appState.profile = profile;
  nameInput.value = profile.displayName;
  saveSetting(storageKeys.displayName, profile.displayName);
  if (!user.displayName && profile.displayName) {
    await user.updateProfile({ displayName: profile.displayName });
  }
}

function subscribeContacts(uid) {
  if (!firebaseReady || !db) return;

  unsubscribeContacts = db
    .collection("users")
    .doc(uid)
    .collection("contacts")
    .orderBy("updatedAt", "desc")
    .onSnapshot(
      (snapshot) => {
        appState.contacts = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            contactUid: data.contactUid || docSnap.id,
            contactName: data.contactName || "Unknown",
            contactEmail: data.contactEmail || "",
            conversationId: data.conversationId || getPrivateConversationId(uid, docSnap.id),
          };
        });
        renderContacts(appState.contacts);
      },
      (error) => {
        console.error("Contact subscription failed", error);
        contactHint.textContent = "Could not load contacts.";
      }
    );
}

function subscribeCurrentChat() {
  if (!firebaseReady || !db) {
    renderPreviewMessages();
    return;
  }

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const chatRef = currentMessagesRef();
  if (!chatRef) return;

  ensureChatDocument().catch(() => {});

  unsubscribeMessages = chatRef.orderBy("createdAt", "asc").onSnapshot(
    (snapshot) => {
      const messages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          text: data.text || "",
          senderId: data.senderId || "",
          senderName: data.senderName || "Unknown",
          senderEmail: data.senderEmail || "",
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        };
      });
      renderMessages(messages);
      messageCount.textContent = `${messages.length} message${messages.length === 1 ? "" : "s"}`;
      chatState.textContent = "Live sync";
      updateComposerState();
    },
    (error) => {
      console.error("Message subscription failed", error);
      chatState.textContent = "Sync error";
      composerHint.textContent = "Could not load messages. Check Firestore rules.";
    }
  );
}

async function ensureChatDocument() {
  if (!firebaseReady || !db) return;

  if (appState.activeChat.type === "room") {
    await db.collection("rooms").doc(appState.activeChat.id).set(
      {
        roomId: appState.activeChat.id,
        label: appState.activeChat.label,
        type: "public",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  if (!auth || !auth.currentUser) return;

  await db.collection("conversations").doc(appState.activeChat.id).set(
    {
      type: "private",
      memberIds: [auth.currentUser.uid, appState.activeChat.peerId].sort(),
      label: appState.activeChat.label,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function currentMessagesRef() {
  if (!firebaseReady || !db) return null;

  if (appState.activeChat.type === "room") {
    return db.collection("rooms").doc(appState.activeChat.id).collection("messages");
  }

  if (!auth || !auth.currentUser) return null;
  return db.collection("conversations").doc(appState.activeChat.id).collection("messages");
}

function setActiveChat(chat) {
  appState.activeChat = chat;
  saveSetting(storageKeys.activeType, chat.type);
  saveSetting(storageKeys.activeId, chat.id);
  saveSetting(storageKeys.activeLabel, chat.label);
  saveSetting(storageKeys.activePeerId, chat.peerId || "");
  roomInput.value = "";
  renderActiveChat();
  if (firebaseReady && authReady) {
    subscribeCurrentChat();
  } else {
    renderPreviewMessages();
  }
}

function renderActiveChat() {
  chatTypeLabel.textContent = appState.activeChat.type === "private" ? "Direct message" : "Public room";
  chatTitle.textContent = appState.activeChat.label;
  markActiveSelections();
  updateComposerState();
}

function markActiveSelections() {
  roomList.querySelectorAll("button[data-room]").forEach((button) => {
    const isActive = appState.activeChat.type === "room" && button.dataset.room === appState.activeChat.id;
    button.classList.toggle("is-active", isActive);
  });

  contactList.querySelectorAll("button[data-contact-id]").forEach((button) => {
    const isActive = appState.activeChat.type === "private" && button.dataset.contactId === appState.activeChat.peerId;
    button.classList.toggle("is-active", isActive);
  });
}

function renderContacts(contacts) {
  if (!contacts.length) {
    contactList.innerHTML = `
      <div class="empty-list">No contacts yet. Add someone by email to start a private chat.</div>
    `;
    markActiveSelections();
    return;
  }

  contactList.innerHTML = contacts
    .map(
      (contact) => `
        <button class="contact-item" data-contact-id="${escapeHtml(contact.contactUid)}" type="button">
          <strong>${escapeHtml(contact.contactName)}</strong>
          <span>${escapeHtml(contact.contactEmail || "Private chat")}</span>
        </button>
      `
    )
    .join("");

  contactList.querySelectorAll("button[data-contact-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const contact = contacts.find((entry) => entry.contactUid === button.dataset.contactId);
      if (!contact) return;
      setActiveChat({
        type: "private",
        id: contact.conversationId,
        label: contact.contactName,
        peerId: contact.contactUid,
      });
    });
  });

  markActiveSelections();
}

function renderMessages(messages) {
  const safeMessages = (messages || []).slice(-200);
  messageCount.textContent = `${safeMessages.length} message${safeMessages.length === 1 ? "" : "s"}`;

  if (!safeMessages.length) {
    messagesEl.innerHTML = `
      <div class="empty-chat">
        <div>
          <h3>Welcome to UniSend</h3>
          <p>Choose a public room or start a private chat from your contacts. Once Firebase is configured, messages sync in realtime.</p>
        </div>
      </div>
    `;
    return;
  }

  messagesEl.innerHTML = safeMessages
    .map((message) => {
      const mine = isMessageMine(message);
      return `
        <article class="message ${mine ? "message-mine" : ""}">
          <div class="message-meta">
            <strong>${escapeHtml(mine ? "You" : message.senderName || "Unknown")}</strong>
            <time>${formatTimestamp(message.createdAt)}</time>
          </div>
          <p>${escapeHtml(message.text)}</p>
        </article>
      `;
    })
    .join("");

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPreviewMessages() {
  if (!appState.previewMessages.length) {
    renderMessages([]);
    return;
  }

  renderMessages(appState.previewMessages);
}

function updateComposerState() {
  if (!firebaseReady || !auth) {
    messageInput.disabled = false;
    sendBtn.disabled = false;
    composerHint.textContent = firebaseReady
      ? "Connecting to Firebase..."
      : "Paste your Firebase config to enable auth and realtime sync.";
    return;
  }

  const locked = !auth || !auth.currentUser;
  messageInput.disabled = locked;
  sendBtn.disabled = locked;

  if (locked) {
    composerHint.textContent = appState.activeChat.type === "private"
      ? "Sign in to send private messages."
      : "Sign in to send public room messages.";
    return;
  }

  composerHint.textContent = appState.activeChat.type === "private"
    ? "Private chat is synced through Firestore."
    : "Public room messages sync instantly through Firestore.";
}

function isMessageMine(message) {
  if (firebaseReady && auth && auth.currentUser) {
    return message.senderId === auth.currentUser.uid;
  }

  return message.senderId === sessionId;
}

function loadActiveChat() {
  const type = loadSetting(storageKeys.activeType, "room");
  const id = loadSetting(storageKeys.activeId, "public-lobby");
  const label = loadSetting(storageKeys.activeLabel, "Public Lobby");
  const peerId = loadSetting(storageKeys.activePeerId, "");
  return { type, id, label, peerId };
}

function displayNameFor(user) {
  return user?.displayName || appState.profile?.displayName || nameInput.value.trim() || user?.email?.split("@")[0] || `Guest-${sessionId.slice(-4)}`;
}

function getPrivateConversationId(uidA, uidB) {
  return [uidA, uidB].sort().join("__");
}

function sanitizeRoomId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatRoomLabel(roomId) {
  return roomId
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getSessionId() {
  const storageKey = "unisend-session";
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const next = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(storageKey, next);
  return next;
}

function loadSetting(key, fallback) {
  return localStorage.getItem(key) || fallback;
}

function saveSetting(key, value) {
  localStorage.setItem(key, value);
}

function isFirebaseConfigReady(config) {
  return Object.values(config).every((value) => typeof value === "string" && !value.startsWith("YOUR_"));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  const date = value instanceof Date ? value : new Date();
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readableFirebaseError(error) {
  const code = error?.code || "";
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return "The email or password is incorrect.";
  }
  if (code.includes("auth/email-already-in-use")) {
    return "That email already has an account.";
  }
  if (code.includes("auth/weak-password")) {
    return "Use a stronger password with at least 6 characters.";
  }
  if (code.includes("permission-denied")) {
    return "Firestore rejected the request. Check your security rules.";
  }
  return error?.message || "Something went wrong.";
}
