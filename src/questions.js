export const QUESTIONS = [
  {
    id: "q1",
    subject: "cloud",
    question: "Which cloud service model provides virtual machines, networking, and raw storage to the user?",
    choices: ["SaaS", "PaaS", "IaaS", "FaaS"],
    answerIndex: 2,
    explanation: "IaaS (Infrastructure as a Service) delivers foundational computing, storage, and networking resources."
  },
  {
    id: "q2",
    subject: "cloud",
    question: "What is the primary operational advantage of serverless computing for irregular workloads?",
    choices: [
      "Dedicated idle servers",
      "Pay-per-execution scaling down to zero cost",
      "Manual instance patching",
      "Persistent TCP socket tunnels"
    ],
    answerIndex: 1,
    explanation: "Serverless architectures scale down to zero when idle and bill strictly per invocation or compute time."
  },
  {
    id: "q3",
    subject: "networking",
    question: "At which layer of the OSI model does the Internet Protocol (IP) operate?",
    choices: ["Data Link (Layer 2)", "Network (Layer 3)", "Transport (Layer 4)", "Session (Layer 5)"],
    answerIndex: 1,
    explanation: "Layer 3 (Network Layer) handles logical addressing and packet routing across network segments."
  },
  {
    id: "q4",
    subject: "networking",
    question: "Which protocol translates human-readable domain names into IP addresses?",
    choices: ["DHCP", "DNS", "BGP", "ARP"],
    answerIndex: 1,
    explanation: "DNS (Domain Name System) translates hostnames into IP addresses for internet routing."
  },
  {
    id: "q5",
    subject: "networking",
    question: "Which transport protocol guarantees ordered, reliable packet delivery via connection handshakes?",
    choices: ["UDP", "TCP", "ICMP", "IGMP"],
    answerIndex: 1,
    explanation: "TCP uses a three-way handshake and sequence numbers to ensure reliable delivery."
  },
  {
    id: "q6",
    subject: "git",
    question: "Which command records staged file snapshots into local Git repository history?",
    choices: ["git push", "git commit", "git pull", "git merge"],
    answerIndex: 1,
    explanation: "git commit creates a permanent snapshot of changes in the staging area."
  },
  {
    id: "q7",
    subject: "git",
    question: "What does the command 'git checkout -b feature' do?",
    choices: [
      "Deletes a branch named feature",
      "Creates and switches to a new branch named feature",
      "Discards all uncommitted changes",
      "Downloads remote commits"
    ],
    answerIndex: 1,
    explanation: "The -b flag instructs Git to create a new branch and switch HEAD to it immediately."
  },
  {
    id: "q8",
    subject: "security",
    question: "Which digital signature algorithm does Discord require for interaction verification?",
    choices: ["RSA-2048", "Ed25519", "ECDSA P-256", "HMAC-SHA256"],
    answerIndex: 1,
    explanation: "Discord mandates Ed25519 asymmetric signatures for verifying interaction origin authenticity."
  },
  {
    id: "q9",
    subject: "cloud",
    question: "What mechanism allows Cloudflare Workers to run scheduled cron jobs without an incoming HTTP request?",
    choices: ["Cron Triggers (Scheduled Event)", "WebSocket listener", "Polling loop", "D1 Watcher"],
    answerIndex: 0,
    explanation: "Cloudflare Workers support Cron Triggers that emit 'scheduled' events at defined cron intervals."
  },
  {
    id: "q10",
    subject: "security",
    question: "Why should API tokens and bot secrets never be committed to a public Git repository?",
    choices: [
      "Git does not support long strings",
      "Leaked credentials permit unauthorized account takeover and quota abuse",
      "Cloudflare blocks repos with strings over 32 chars",
      "Tokens expire when saved in git"
    ],
    answerIndex: 1,
    explanation: "Publicly committing secrets allows crawlers to compromise services and run up charges or abuse permissions."
  }
];

export function findQuestionById(id) {
  return QUESTIONS.find((q) => q.id === id) || null;
}

export function getRandomQuestion(subject) {
  const filtered = subject
    ? QUESTIONS.filter((q) => q.subject.toLowerCase() === subject.toLowerCase().trim())
    : QUESTIONS;
  if (filtered.length === 0) return null;
  const index = Math.floor(Math.random() * filtered.length);
  return filtered[index];
}
