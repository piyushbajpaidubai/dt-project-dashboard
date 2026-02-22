const { google } = require("googleapis");
exports.handler = async (event) => {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\\\n/g, "\\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (event.httpMethod === "GET") {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:B",
    });
    const rows = res.data.values || [];
    const data = {};
    rows.forEach(([key, value]) => { if (key !== "key") data[key] = value; });
    return { statusCode: 200, body: JSON.stringify(data) };
  }
  if (event.httpMethod === "POST") {
    const data = JSON.parse(event.body);
    const values = Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A2",
      valueInputOption: "RAW",
      requestBody: { values },
    });
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }
  return { statusCode: 405, body: "Method not allowed" };
};