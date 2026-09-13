import type { BlueprintId } from "@/lib/game";

export default function BlueprintArt({ kind, large = false }: { kind: BlueprintId; large?: boolean }) {
  return <svg className={large ? "blueprint-art large" : "blueprint-art"} viewBox="0 0 160 120" fill="none" aria-hidden="true">
    <ellipse cx="82" cy="104" rx="56" ry="10" fill="#bac6a8" opacity=".35" />
    <path d="m16 92 58-28 72 27-58 26-72-25Z" fill="#a9be87"/>
    <path d="m16 92 72 25v-7L16 86v6Z" fill="#879967"/><path d="m88 117 58-26v-6l-58 25v7Z" fill="#799161"/>
    {kind === "cabin" && <>
      <path d="m35 57 52-23 42 27-52 25-42-29Z" fill="#e8cca2"/>
      <path d="m35 57 42 24v28L35 84V57Z" fill="#b57f4e"/><path d="m77 81 52-24v29l-52 23V81Z" fill="#d9ad77"/>
      <path d="m26 58 27-31 51 0-30 55-48-24Z" fill="#4c6151"/>
      <path d="m53 27 51-23 34 52-64 26 30-55-51 0Z" fill="#647b61"/>
      <path d="m104 4 34 52-9 2-28-43-48 17v-5l51-23Z" fill="#384e40"/>
      <path d="M53 28 102 8m-40 33 46-22M55 51l60-23M69 60l52-22m-38 32 44-21" stroke="#81916d" strokeWidth="2"/>
      <path d="m48 72 13 7v18l-13-7V72Z" fill="#654a36"/><path d="m86 83 15-7v14l-15 7V83Zm24-11 12-5v13l-12 5V72Z" fill="#a3d3ce"/>
      <path d="m93 80 0 14m23-24v13M86 89l15-7m9-4 12-5" stroke="#f7e5c1" strokeWidth="2"/>
      <path d="m87 32 0-21 10-4 6 3v21l-10 5-6-4Z" fill="#a6a69a"/><path d="m97 7 6 3-10 5-6-4 10-4Z" fill="#c1c1ac"/>
      <path d="m29 83 44 26 61-27M33 88l39 24 63-28" stroke="#e6c998" strokeWidth="3"/>
    </>}
    {kind === "aframe" && <>
      <path d="m33 88 31-69 48-18 33 78-62 27-50-18Z" fill="#536953"/>
      <path d="m64 19 19 87 62-27-33-78-48 18Z" fill="#70816b"/>
      <path d="m33 88 31-69 19 87-50-18Z" fill="#dbb67f"/>
      <path d="m44 85 18-43 12 54-30-11Z" fill="#9cc7c2"/>
      <path d="m62 42 0 50M49 73l23 8" stroke="#eed7ab" strokeWidth="3"/>
      <path d="m64 19 19 87M76 16l21 83m-9-88 23 82m-11-86 25 80" stroke="#4c6250" strokeWidth="2"/>
      <path d="m27 91 56 21 68-29" stroke="#d6bc90" strokeWidth="5"/>
    </>}
    {kind === "tower" && <>
      <path d="m52 91 6-49m41 63-6-48m24-15 8 49M59 59l36 35M57 91l37-32m6 34 20-40m-21 4 22 31" stroke="#947551" strokeWidth="6"/>
      <path d="m46 51 50-23 36 19-37 23-49-19Z" fill="#ddbf8d"/>
      <path d="m50 31 41-19 32 20v22L91 68 50 50V31Z" fill="#d3ad79"/>
      <path d="m49 32 43 18 37-19-34-26-46 27Z" fill="#5c735c"/>
      <path d="m49 32 46-27-16-10-45 31 15 6Z" fill="#829171"/>
      <path d="m58 38 11 5v12l-11-5V38Zm19 7 10 4v12l-10-4V45Zm23 4 14-7v12l-14 7V49Z" fill="#82b6b0"/>
      <path d="m53 104 21-38m-18 31 8 2m-4-10 9 2m-4-10 8 2m-4-10 8 2" stroke="#c9b28b" strokeWidth="3"/>
    </>}
    <path d="m23 87 0-13" stroke="#705d41" strokeWidth="3"/><path d="m23 53-13 23h26L23 53Z" fill="#688658"/><path d="m23 47-11 22h22L23 47Z" fill="#7c9564"/>
    <path d="M140 91V74" stroke="#705d41" strokeWidth="3"/><path d="m140 51-13 28h26l-13-28Z" fill="#607f54"/><path d="m140 45-10 24h20l-10-24Z" fill="#829b67"/>
    <path d="m14 93 5-2 6 3-5 2-6-3Zm108 9 8-4 8 3-8 4-8-3Z" fill="#dce0c8"/>
  </svg>;
}
