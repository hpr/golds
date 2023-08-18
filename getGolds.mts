import dotenv from "dotenv";
import fs from "fs";
import * as cheerio from "cheerio";
import querystring from "querystring";
import { getRelayNames, majors } from "./const.mjs";
dotenv.config();

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

let tilasIds: { [sexId: string]: string[] } = {};
let golds: { [sexIdOrName: string]: string[] } = {};
let relayNames: { [name: string]: string[] } = {};

if (fs.existsSync("./golds.json")) {
  ({ tilasIds, golds, relayNames } = JSON.parse(
    fs.readFileSync("./golds.json", "utf-8")
  ));
  // for (const { majortype, name } of majors) {
  //   const majorsName = `./majors/${name}.html`;
  //   const $ = cheerio.load(fs.readFileSync(majorsName, "utf-8"));
  //   const meetLinks = [
  //     ...$('a[href^="https://www.tilastopaja.eu/db/results.php"]'),
  //   ]
  //     .filter((a) => $(a).text() === name)
  //     .map((a) => a.attribs.href);
  //   for (const meetLink of meetLinks) {
  //     const { Season: year, CID } = querystring.parse(
  //       meetLink?.split("?")[1]!
  //     ) as { Season: string; CID: string };
  //     const meetName = `./majors/${name}/${year}_${CID}.html`;
  //     console.log(meetName);
  //     const $ = cheerio.load(fs.readFileSync(meetName, "utf-8"));
  //     for (const name in relayNames) {
  //       for (const a of $('a[href^="https://www.tilastopaja.eu/db/at.php"]')) {
  //         const idName = $(a).text();
  //         if (idName.replaceAll(" ", " ").trim() === name) {
  //           console.log("found", name);
  //           const { Sex, ID } = querystring.parse(
  //             a.attribs.href.split("?")[1]!
  //           ) as { Sex: string; ID: string };
  //           const sexId = getSexId(Sex, ID);
  //           golds[sexId] ??= [];
  //           golds[sexId].push(...relayNames[name]);
  //           tilasIds[sexId] ??= [];
  //           tilasIds[sexId].push(idName);
  //           delete relayNames[name];
  //           break;
  //         }
  //       }
  //     }
  //   }
  //   fs.writeFileSync(
  //     "./golds.json",
  //     JSON.stringify({ relayNames, golds, tilasIds })
  //   );
  // }
  for (const relayName in relayNames) {
    const searchRequest = await fetch(
      "https://www.tilastopaja.eu/db/ats.php?" +
        new URLSearchParams({ Name: relayName }),
      { headers: { Cookie } }
    );
    let athUrl: string | undefined;
    if (searchRequest.url.startsWith("https://www.tilastopaja.eu/db/at.php")) {
      athUrl = searchRequest.url;
    } else {
      const $ = cheerio.load(await searchRequest.text());
      athUrl = $('a[href^="at.php"]').first().attr("href");
    }
    if (!athUrl) {
      console.log("no match", relayName);
      continue;
    }
    const { Sex, ID } = querystring.parse(athUrl.split("?")[1]) as {
      Sex: string;
      ID: string;
    };
    const sexId = getSexId(Sex, ID);
    golds[sexId] ??= [];
    golds[sexId].push(...relayNames[relayName]);
    tilasIds[sexId] ??= [];
    tilasIds[sexId].push(relayName);
    delete relayNames[relayName];
    fs.writeFileSync(
      "./golds.json",
      JSON.stringify({ relayNames, golds, tilasIds })
    );
    console.log(`wrote ${relayName}`);
    await new Promise((res) => setTimeout(res, 500));
  }
  fs.writeFileSync(
    "./golds.json",
    JSON.stringify({ relayNames, golds, tilasIds })
  );
} else {
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
    const $ = cheerio.load(majorsHtml);
    const meetLinks = [
      ...$('a[href^="https://www.tilastopaja.eu/db/results.php"]'),
    ]
      .filter((a) => $(a).text() === name)
      .map((a) => a.attribs.href);
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
      const $ = cheerio.load(meetHtml);
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
        if (
          ["relay", "team", "4 x"].some((r) =>
            eventName?.toLowerCase().includes(r)
          )
        ) {
          const winnerTeamA = eventDiv
            .find('td > a[href^="https://www.tilastopaja.eu/db/at.php"]')
            .first();
          const winnerTeamUrl = winnerTeamA.attr("href");
          const winners: string[] = [
            ...new Set(
              [...eventDiv.find(`a.desktop[href="${winnerTeamUrl}"]`)].flatMap(
                (winnerA) => {
                  const winnerTr = winnerA.parent?.parent;
                  const winnerNames = getRelayNames(
                    $(winnerTr!).next().find("td[colspan]").first().text()
                  );
                  console.log(winnerNames);
                  return winnerNames.length > 1 ? winnerNames : [];
                }
              )
            ),
          ];
          for (const name of winners) {
            relayNames[name] ??= [];
            relayNames[name].push(getDate(year, eventDate));
          }
        } else {
          const winnerA = eventDiv
            .find('td > a[href^="https://www.tilastopaja.eu/db/at.php"]')
            .first();
          const { Sex, ID } = querystring.parse(
            winnerA?.attr("href")?.split("?")[1]!
          ) as { Sex: string; ID: string };
          const sexId = getSexId(Sex, ID);
          const athName = winnerA.text();
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
      tilasIds[sexId].some(
        (tilasName) => tilasName.replaceAll(" ", " ") === name
      )
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
}
