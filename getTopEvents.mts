import fs from "fs";
import * as cheerio from "cheerio";
import querystring from "querystring";
import { extractSexId, getRelayNames, majors } from "./const.mjs";

const getDate = (year: string, eventDate: string = "January 1") =>
  new Date(`${year} ${eventDate}`).toISOString().split("T")[0];

const { tilasIds, golds, relayNames } = JSON.parse(
  fs.readFileSync("./golds.json", "utf-8")
) as {
  tilasIds: { [sexId: string]: string[] };
  golds: { [sexIdOrName: string]: string[] };
  relayNames: { [name: string]: string[] };
};

let events: { [name: string]: { allGolds: string[]; pastGolds: string[] } } =
  {};

if (fs.existsSync("./topEvents.json")) {
  events = JSON.parse(fs.readFileSync("./topEvents.json", "utf-8"));
  const top10 = Object.keys(events)
    .sort((a, b) => events[a].allGolds.length - events[b].allGolds.length)
    .map((key) => {
      const goldArr = events[key].allGolds;
      return `${key}: [${goldArr.length}] ${goldArr
        .map(
          (sexId) =>
            `${tilasIds[sexId][0]} (${[
              ...new Set(golds[sexId].map((dt) => dt.slice(0, 4)).sort()),
            ].join(", ")})`
        )
        .join(", ")}`;
    });
  console.log(top10.join('\n'))
} else {
  for (const { majortype, name } of majors) {
    const majorsName = `./majors/${name}.html`;
    const $ = cheerio.load(fs.readFileSync(majorsName, "utf-8"));
    const meetLinks = [
      ...$('a[href^="https://www.tilastopaja.eu/db/results.php"]'),
    ]
      .filter((a) => $(a).text() === name)
      .map((a) => a.attribs.href);
    for (const meetLink of meetLinks) {
      const { Season: year, CID } = querystring.parse(
        meetLink?.split("?")[1]!
      ) as { Season: string; CID: string };
      const meetName = `./majors/${name}/${year}_${CID}.html`;
      console.log(meetName);
      const $ = cheerio.load(fs.readFileSync(meetName, "utf-8"));

      const eventBs = $("td.event b");
      let eventSex = $("td.sex b").first().text();
      
      let stop = false;
      for (const eventB of eventBs) {
        const eventName = $(eventB).text();
        const eventTr = eventB.parent?.parent!;
        const eventDate = $(eventTr).find("td.date").first().text();
        const trsToWrap: cheerio.Node[] = [eventTr!];
        let ptr: cheerio.Node | null = eventTr.next ?? null;
        while (ptr && !$(ptr).find("td.event").length) {
          trsToWrap.push(ptr);
          if ($(ptr).find("td.sex b").length) {
            eventSex = $(ptr).find("td.sex b").first().text();
            if (['multi', 'thlon'].some(multi => eventSex.toLowerCase().includes(multi))) {
              stop = true;
              break;
            }
            ptr = ptr.next;
          }
          if (ptr) ptr = ptr.next;
        }
        if (stop) break;
        const eventDiv = $("<div></div>");
        trsToWrap.forEach((tr) => {
          eventDiv.append(tr);
        });
        console.log(meetName, eventSex, eventName, eventDate, trsToWrap.length);
        const eventYearMonth = getDate(year, eventDate);

        const relayNames = [
          ...new Set(
            [...eventDiv.find('td[colspan="8"]')].flatMap((td) =>
              getRelayNames($(td).text())
            )
          ),
        ];
        const allGoldParticipants = Object.keys(golds).filter((sexId) => {
          const { sex, id } = extractSexId(sexId);
          if (eventName.includes("4 x")) {
            return relayNames.some((relayName) =>
              tilasIds[sexId]
                .map((name) => name.replaceAll(" ", " "))
                .includes(relayName)
            );
          }
          return eventDiv.find(
            `a[href^="https://www.tilastopaja.eu/db/at.php?Sex=${sex}&ID=${id}"]`
          ).length;
        });
        const pastGoldParticipants = allGoldParticipants.filter((sexId) =>
          golds[sexId].some((dt) => dt < eventYearMonth)
        );
        events[`${year} ${eventSex} ${eventName}`] = {
          allGolds: allGoldParticipants,
          pastGolds: pastGoldParticipants,
        };
        console.log(allGoldParticipants.length, pastGoldParticipants.length);
      }
    }
  }
  fs.writeFileSync("./topEvents.json", JSON.stringify(events));
}
