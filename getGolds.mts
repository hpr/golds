import dotenv from "dotenv";
import fs from "fs";
import { JSDOM } from "jsdom";
import querystring from "querystring";
dotenv.config();

const majors = [
  { majortype: "28", name: "OG" },
  { majortype: "1", name: "WC" },
];

const cookies = {
  sec_session_id: process.env.SEC_SESSION_ID,
  TestCookie: process.env.TEST_COOKIE,
};
const Cookie = Object.entries(cookies)
  .map(([k, v]) => `${k}=${v}`)
  .join("; ");

const getSexId = (sex: string, id: string) => `${sex}/${id}`;
const getDate = (year: string, eventDate: string = "January 1") =>
  new Date(`${year} ${eventDate}`).toISOString().split("T")[0];

const tilasIds: { [sexId: string]: string[] } = {};

const golds: { [sexIdOrName: string]: string[] } = {};

const relayNames: { [name: string]: string[] } = {};

for (const { majortype, name } of majors) {
  const majorsName = `./majors/${name}.html`;
  const majorsHtml = fs.existsSync(majorsName)
    ? fs.readFileSync(majorsName, "utf-8")
    : await (async () => {
        const majorsHtml = await (
          await fetch(
            "https://www.tilastopaja.eu/db/resultservice.php?" +
              new URLSearchParams({ maj: "1", fullname: "0", majortype }),
            { headers: { Cookie } }
          )
        ).text();
        fs.writeFileSync(majorsName, majorsHtml);
        return majorsHtml;
      })();
  const { document } = new JSDOM(majorsHtml).window;
  const meetLinks = [
    ...document.querySelectorAll(
      'a[href^="https://www.tilastopaja.eu/db/results.php"]'
    ),
  ]
    .filter((a) => a.textContent === name)
    .map((a) => a.getAttribute("href"));
  if (!fs.existsSync(`majors/${name}`)) fs.mkdirSync(`majors/${name}`);

  for (const meetLink of meetLinks) {
    const { Season: year, CID } = querystring.parse(
      meetLink?.split("?")[1]!
    ) as { Season: string; CID: string };

    const meetName = `./majors/${name}/${year}_${CID}.html`;
    const meetHtml = fs.existsSync(meetName)
      ? fs.readFileSync(meetName, "utf-8")
      : await (async () => {
          const meetHtml = await (
            await fetch(meetLink!, { headers: { Cookie } })
          ).text();
          fs.writeFileSync(meetName, meetHtml);
          return meetHtml;
        })();
    const dom = new JSDOM(meetHtml);
    const { document } = dom.window;
    const eventBs = document.querySelectorAll("td.event b");

    for (const eventB of eventBs) {
      const eventName = eventB.textContent;
      const eventTr = eventB.parentElement?.parentElement;
      const eventDate =
        eventTr?.querySelector("td.date")?.textContent ?? undefined;
      let sexPtr: Element | null = eventTr ?? null;
      //   [ 'Men', 235 ],
      //   [ 'Women', 2210 ],
      //   [ 'Multievents', 4041 ],
      //   [ 'Men', 4042 ],
      //   [ 'Women', 4412 ]
      while (sexPtr && !sexPtr?.querySelector("td.sex b")) {
        sexPtr = sexPtr.previousElementSibling;
      }
      const eventSex = sexPtr?.textContent;
      const trsToWrap: Element[] = [eventTr!];
      let ptr: Element | null = eventTr?.nextElementSibling ?? null;
      while (ptr && !ptr?.querySelector("td.event")) {
        trsToWrap.push(ptr);
        ptr = ptr?.nextElementSibling;
      }
      const eventDiv = document.createElement("div");
      trsToWrap.forEach((tr) => {
        if (!tr.querySelector("td.sex b")) eventDiv.appendChild(tr);
      });
      console.log(meetName, eventSex, eventName, eventDate, trsToWrap.length);
      if (
        ["relay", "team", "4 x"].some((r) =>
          eventName?.toLowerCase().includes(r)
        )
      ) {
        const winnerTeamA = eventDiv.querySelector(
          'td > a[href^="https://www.tilastopaja.eu/db/at.php"]'
        );
        const winnerTeamUrl = winnerTeamA?.getAttribute("href");
        const winners: string[] = [
          ...new Set(
            [
              ...eventDiv.querySelectorAll(
                `a.desktop[href="${winnerTeamUrl}"]`
              ),
            ].flatMap((winnerA) => {
              const winnerTr = winnerA.parentElement?.parentElement;
              const winnerNames = winnerTr?.nextElementSibling
                ?.querySelector("td[colspan]")
                ?.textContent?.trim()
                .split(", ")!;
              return winnerNames;
            })
          ),
        ];
        for (const name of winners) {
          relayNames[name] ??= [];
          relayNames[name].push(getDate(year, eventDate));
        }
      } else {
        const winnerA = eventDiv.querySelector(
          'td > a[href^="https://www.tilastopaja.eu/db/at.php"]'
        );
        const { Sex, ID } = querystring.parse(
          winnerA?.getAttribute("href")?.split("?")[1]!
        ) as { Sex: string; ID: string };
        const sexId = getSexId(Sex, ID);
        const athName = winnerA?.textContent!;
        tilasIds[sexId] ??= [];
        if (!tilasIds[sexId].includes(athName)) tilasIds[sexId].push(athName);
        golds[sexId] ??= [];
        golds[sexId].push(getDate(year, eventDate));
      }
    }
    fs.writeFileSync(
      "./golds.json",
      JSON.stringify({ relayNames, golds, tilasIds })
    );
  }
}

for (const name in relayNames) {
  const matchingSexId = Object.keys(golds).find((sexId) =>
    tilasIds[sexId].some((tilasName) => tilasName.replaceAll(" ", " ") === name)
  );
  if (matchingSexId) {
    golds[matchingSexId].push(...relayNames[name]);
    delete relayNames[name];
  }
}
fs.writeFileSync(
  "./golds.json",
  JSON.stringify({ relayNames, golds, tilasIds })
);
