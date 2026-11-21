/**
 * All copy, links and project data live here.
 * Templates only loop over this, so editing content never touches layout.
 */

import type { SketchKind } from './components/sketch/registry';

export type RoleId = 'architect' | 'embedded' | 'designer';
export type Persona = 'jan' | RoleId;

export interface Role {
  id: RoleId;
  /** Short name for buttons and filters. */
  label: string;
  /** The visitor's question, one line per split-flap row. */
  question: [string, string];
  /** My answer. Each role gets its own, honest one. */
  answer: string;
  pitch: string;
}

export const ROLES: Role[] = [
  {
    id: 'architect',
    label: 'Architecture',
    question: ['Development &', 'Architecture?'],
    answer: 'I can do that.',
    pitch:
      'Systems that stay clean while they grow. Clear boundaries, boring deployments and decisions that are written down instead of remembered.',
  },
  {
    id: 'embedded',
    label: 'Embedded',
    question: ['Embedded &', 'IoT?'],
    answer: "I've done that.",
    pitch:
      'Code that leaves the screen. Sensors, Raspberry Pis and microcontrollers, plus the kind of performance work where every millisecond is a feature.',
  },
  {
    id: 'designer',
    label: 'Design',
    question: ['Design &', 'UX?'],
    answer: 'I like doing that.',
    pitch:
      'Interfaces that actually feel like something. From Figma and Illustrator to motion that is engineered, not guessed.',
  },
];

export const roleById = (id: RoleId) => ROLES.find((r) => r.id === id)!;

/** TODO(jan): verify the mail address and fill in the LinkedIn & Strava profile URLs. */
export const CONTACTS = [
  { label: 'Mail', value: 'ningelschlingel@gmail.com', href: 'mailto:ningelschlingel@gmail.com' },
  { label: 'GitHub', value: 'ningelschlingel', href: 'https://github.com/ningelschlingel' },
  { label: 'LinkedIn', value: 'Jan Ningelgen', href: 'https://www.linkedin.com/in/jan-ningelgen/' },
  { label: 'Strava', value: 'Road cycling', href: 'https://www.strava.com/athletes/ningelschlingel' },
];

const contact = (label: string) => CONTACTS.find((c) => c.label === label)!.href;
export const MAIL = contact('Mail');
export const LINKEDIN = contact('LinkedIn');
export const STRAVA = contact('Strava');

/** The ME pages after the hello. */
export interface Chapter {
  label: string;
  title: string;
  copy: string;
  /** What lives on the page: a 3D line sketch (see sketch/registry.ts) or a flat 2D visual. */
  visual: Visual;
}

/** Flat 2D visuals, each its own component (see Home's template). */
export type FlatKind = 'inks' | 'pico' | 'charts' | 'modules' | 'bike';
export type Visual = SketchKind | FlatKind;

export const CHAPTERS: Chapter[] = [
  {
    label: 'Logic',
    visual: 'modules',
    title: 'Systems that stay clean.',
    copy: 'Scalable backends with Spring Boot, fluid UIs with Angular Signals, and a clean bridge in between: vertical feature slices, explicit use cases and setups that start with a single command.',
  },
  {
    label: 'Metal',
    visual: 'pico',
    title: 'Close to the hardware.',
    copy: 'I love the moment code leaves the screen and does something in the room: radar sensors on a Raspberry Pi, microcontrollers driving LEDs, clocks that tell time in words.',
  },
  {
    label: 'Aesthetics',
    visual: 'inks',
    title: 'Visual intuition.',
    copy: 'I translate complex workflows into intentional UX. From a vector-perfect Illustrator asset to a Figma prototype, designed with technical constraints in mind and motion that feels physical.',
  },
  {
    label: 'Strategy',
    visual: 'charts',
    title: 'The business interface.',
    copy: 'Code exists to solve market problems. I am deepening my understanding of financial modeling and entrepreneurial leadership, so technical decisions line up with long-term ROI.',
  },
  {
    label: 'Analog',
    visual: 'bike',
    title: 'Off screen.',
    copy: 'Most likely on a road bike, climbing the Taunus. Long rides are where the best solutions arrive: steady output, no wasted watts, patience on the long climbs. On rainy days, a guitar or a game of chess.',
  },
];

export interface Project {
  title: string;
  hook: string;
  pitch: string;
  roles: RoleId[];
  tags: string[];
  links: { label: string; href: string }[];
  /** Repos that are not public get a note instead of a link. */
  note?: string;
  /** Title image in public/projects/. Until the file has content, the card shows a placeholder. */
  image: string;
}

/** Recommended: 1600×1000 (16:10), under 300 kB. Screenshots as .png, photos as .jpg. */
const shot = (file: string) => `projects/${file}`;

const gh = (repo: string) => `https://github.com/ningelschlingel/${repo}`;

export const PROJECTS: Project[] = [
  {
    title: 'Pragmatic Clean Architecture',
    image: shot('pragmatic-clean-architecture.png'),
    hook: 'Architecture without the ceremony.',
    pitch:
      'Clean Architecture for Spring Boot that respects your time: vertical feature slices, use cases that return Either instead of throwing, and interfaces only where they earn their keep.',
    roles: ['architect'],
    tags: ['Java', 'Spring Boot', 'Vavr', 'Hexagonal'],
    links: [{ label: 'GitHub', href: gh('pragmatic-clean-architecture') }],
  },
  {
    title: 'Enterprise Fullstack Blueprint',
    image: shot('enterprise-fullstack-blueprint.png'),
    hook: 'One command to a running enterprise stack.',
    pitch:
      'Spring Boot, Angular, Keycloak and Postgres behind an Nginx gateway, with monitoring and mail on board. Fully dockerized, survives a complete volume wipe and wires itself back up. Decisions live in ADRs.',
    roles: ['architect'],
    tags: ['Docker', 'Keycloak', 'Nginx', 'Spring Boot'],
    links: [{ label: 'GitHub', href: gh('enterprise-fullstack-blueprint') }],
  },
  {
    title: 'p2p Suite',
    image: shot('p2p-suite.png'),
    hook: 'A session layer for the browser. No server in the middle.',
    pitch:
      'Framework-free npm packages for peer-to-peer apps: rooms, seats, host hand-over and reload recovery. Chat, SHA-256 checked file transfer and video plug in on top, all behind ports and adapters.',
    roles: ['architect'],
    tags: ['TypeScript', 'WebRTC', 'npm', 'Ports & Adapters'],
    links: [{ label: 'GitHub', href: gh('p2p') }],
  },
  {
    title: '720p2p',
    image: shot('720p2p.png'),
    hook: 'Video calls without a media server.',
    pitch:
      'Full-mesh WebRTC for up to six people, built on the p2p suite. Capture steps down from 720p as the room fills, a reload drops you straight back into the call, and the whole app weighs 45 kB gzipped.',
    roles: ['architect', 'embedded'],
    tags: ['WebRTC', 'TypeScript', 'Firebase'],
    links: [{ label: 'GitHub', href: gh('720p2p') }],
  },
  {
    title: 'Telegram Security Bot',
    image: shot('telegram-security-bot.jpg'),
    hook: 'A pocket-sized guard that texts you.',
    pitch:
      'A Raspberry Pi Zero, a radar motion sensor and a camera. Motion starts a recording, the clip lands in your Telegram chat, and activation tokens decide who gets to watch.',
    roles: ['embedded'],
    tags: ['Python', 'Raspberry Pi', 'RCWL-0516', 'Telegram API'],
    links: [{ label: 'GitHub', href: gh('telegram-security-bot') }],
  },
  {
    title: 'Raytrace3D',
    image: shot('raytrace3d.png'),
    hook: 'From minutes to milliseconds.',
    pitch:
      'A university raytracer rebuilt in C++ with a bounding volume hierarchy, cache-friendly data and every core busy. 1024× the triangles cost just 5× the render time.',
    roles: ['embedded'],
    tags: ['C++', 'BVH', 'Multithreading'],
    links: [{ label: 'GitHub', href: gh('raytrace3d') }],
  },
  {
    title: 'Word Clocks & Microcontrollers',
    image: shot('wordclock.png'),
    hook: 'Telling time in words.',
    pitch:
      'My private lab: LED matrices, microcontrollers and clocks that spell out the hour. Where weekend ideas turn into things you can hold.',
    roles: ['embedded'],
    tags: ['Microcontrollers', 'LEDs', 'Hardware'],
    links: [],
    note: 'Private repos. Ask me about them.',
  },
  {
    title: 'Split-Flap Display',
    image: shot('split-flap-display.png'),
    hook: 'Mechanics, simulated.',
    pitch:
      'A Solari board in the browser that moves like the real thing: every flap accelerates and brakes like a motor, updates cascade through the board, and the whole display is shareable as one URL.',
    roles: ['designer'],
    tags: ['Angular Signals', 'Tailwind', 'Motion'],
    links: [
      { label: 'Live', href: 'https://ningelschlingel.github.io/split-flap-display/' },
      { label: 'GitHub', href: gh('split-flap-display') },
    ],
  },
  {
    title: 'This Website',
    image: shot('this-website.png'),
    hook: 'A page that never scrolls.',
    pitch:
      'Columns on big screens, rows on small ones, and the window never moves. Angular Signals, Tailwind and a canvas that turns one portrait into four people.',
    roles: ['designer'],
    tags: ['Angular', 'Tailwind', 'Canvas'],
    links: [{ label: 'GitHub', href: gh('me') }],
  },
];
