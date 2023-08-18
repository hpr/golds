export const majors = [
  { majortype: "28", name: "OG" },
  { majortype: "1", name: "WC" },
];

export const extractSexId = (sexId: string) => {
  const [sex, id] = sexId.split("/");
  return { sex, id };
};

export const getRelayNames = (relayResult: string): string[] => {
  return relayResult
    .replace("Mixed nationalities:", "")
    .trim()
    .split(", ")
    .filter((x) => x.trim().length)
    .map((name) => {
      const words = name
        .split(" ")
        .filter((word) => {
          if (word.length === 3 && word === word.toUpperCase()) return false;
          if ([...word].every((c) => "0123456789.:h".includes(c))) return false;
          return true;
        })
        .map((word) => word.trim());
      return words.join(" ");
    });
};
