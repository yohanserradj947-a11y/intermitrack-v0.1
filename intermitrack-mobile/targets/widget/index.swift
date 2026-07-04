import WidgetKit
import SwiftUI

let APP_GROUP = "group.fr.intermitrack.app"
let ORANGE = Color(red: 0.976, green: 0.451, blue: 0.086) // #F97316

// MARK: - Données partagées (JSON écrit par l'app RN via ExtensionStorage)
struct HoursData: Codable { var done: Double; var planned: Double?; var target: Double }
struct NextData: Codable { var when: String; var date: String; var prod: String; var lieu: String; var hours: Double; var price: Double }
struct CalDay: Codable { var d: Int; var ab: String; var g: [String]; var txt: String; var hours: Double; var more: Int; var hach: Bool; var note: String }
struct UpNext: Codable { var date: String; var prod: String; var color: String; var hours: Double; var price: Double }
struct CalData: Codable { var title: String; var firstWeekday: Int; var daysInMonth: Int; var today: Int; var days: [CalDay]; var upcoming: [UpNext]? }

func loadJSON<T: Decodable>(_ key: String) -> T? {
  guard let defs = UserDefaults(suiteName: APP_GROUP),
        let str = defs.string(forKey: key),
        let data = str.data(using: .utf8) else { return nil }
  return try? JSONDecoder().decode(T.self, from: data)
}

extension Color {
  init(hexString: String) {
    let h = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var v: UInt64 = 0
    Scanner(string: h).scanHexInt64(&v)
    if h.count == 6 {
      self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    } else {
      self.init(red: 0.122, green: 0.306, blue: 0.373)
    }
  }
}

extension View {
  @ViewBuilder func widgetBg() -> some View {
    if #available(iOS 17.0, *) { self.containerBackground(for: .widget) { Color(.systemBackground) } }
    else { self.padding(14).background(Color(.systemBackground)) }
  }
}

func fmtHours(_ h: Double) -> String { h == h.rounded() ? "\(Int(h))" : String(format: "%.1f", h) }

// Hachures diagonales (jours en note seule / missions passées perso), comme l'app.
struct HachureOverlay: View {
  var body: some View {
    GeometryReader { geo in
      Path { p in
        let w = geo.size.width, hh = geo.size.height
        var x: CGFloat = -hh
        while x < w { p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x + hh, y: hh)); x += 6 }
      }.stroke(Color.white.opacity(0.32), lineWidth: 1.5)
    }
  }
}

// MARK: - HEURES / 507 h
struct HoursEntry: TimelineEntry { let date: Date; let data: HoursData }
struct HoursProvider: TimelineProvider {
  func placeholder(in c: Context) -> HoursEntry { HoursEntry(date: Date(), data: HoursData(done: 342, planned: 40, target: 507)) }
  func getSnapshot(in c: Context, completion: @escaping (HoursEntry) -> Void) {
    completion(HoursEntry(date: Date(), data: loadJSON("widget_hours") ?? HoursData(done: 0, planned: 0, target: 507)))
  }
  func getTimeline(in c: Context, completion: @escaping (Timeline<HoursEntry>) -> Void) {
    let e = HoursEntry(date: Date(), data: loadJSON("widget_hours") ?? HoursData(done: 0, planned: 0, target: 507))
    completion(Timeline(entries: [e], policy: .after(Date().addingTimeInterval(3600))))
  }
}
struct HoursView: View {
  var data: HoursData
  var planned: Double { data.planned ?? 0 }
  var pct: Double { data.target > 0 ? min(1, max(0, data.done / data.target)) : 0 }
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("HEURES / DROITS").font(.system(size: 10, weight: .bold)).foregroundColor(.secondary)
      Spacer(minLength: 2)
      ZStack {
        Circle().stroke(Color.secondary.opacity(0.2), lineWidth: 9)
        Circle().trim(from: 0, to: pct).stroke(ORANGE, style: StrokeStyle(lineWidth: 9, lineCap: .round)).rotationEffect(.degrees(-90))
        VStack(spacing: 0) {
          Text("\(Int(data.done))").font(.system(size: 21, weight: .heavy)).foregroundColor(.primary)
          Text("/ \(Int(data.target)) h").font(.system(size: 10)).foregroundColor(.secondary)
        }
      }.frame(maxWidth: .infinity)
      Spacer(minLength: 2)
      Text("\(max(0, Int(data.target - data.done - planned))) h restantes").font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetBg()
  }
}
struct HoursWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "IntermitrackHours", provider: HoursProvider()) { e in HoursView(data: e.data) }
      .configurationDisplayName("Heures / droits (507 h)")
      .description("Ta progression vers les droits France Travail.")
      .supportedFamilies([.systemSmall])
  }
}

// MARK: - PROCHAINE MISSION
struct NextEntry: TimelineEntry { let date: Date; let data: NextData? }
struct NextProvider: TimelineProvider {
  func placeholder(in c: Context) -> NextEntry { NextEntry(date: Date(), data: NextData(when: "Demain", date: "ven. 4 juil.", prod: "AIRPROD", lieu: "Studio 4", hours: 8, price: 230)) }
  func getSnapshot(in c: Context, completion: @escaping (NextEntry) -> Void) { completion(NextEntry(date: Date(), data: loadJSON("widget_next"))) }
  func getTimeline(in c: Context, completion: @escaping (Timeline<NextEntry>) -> Void) {
    completion(Timeline(entries: [NextEntry(date: Date(), data: loadJSON("widget_next"))], policy: .after(Date().addingTimeInterval(3600))))
  }
}
struct NextView: View {
  var data: NextData?
  func fmtH(_ h: Double) -> String { h == h.rounded() ? "\(Int(h))" : String(format: "%.1f", h) }
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text("PROCHAINE MISSION").font(.system(size: 10, weight: .bold)).foregroundColor(.secondary)
      if let d = data {
        Text(d.when.uppercased()).font(.system(size: 11, weight: .heavy)).foregroundColor(ORANGE)
        Text(d.prod).font(.system(size: 18, weight: .heavy)).foregroundColor(.primary).lineLimit(1)
        Spacer(minLength: 2)
        Text("\(d.date) · \(fmtH(d.hours)) h").font(.system(size: 12, weight: .semibold)).foregroundColor(.primary).lineLimit(1)
        if d.price > 0 || !d.lieu.isEmpty {
          Text([d.price > 0 ? "\(Int(d.price)) €" : "", d.lieu].filter { !$0.isEmpty }.joined(separator: " · "))
            .font(.system(size: 12)).foregroundColor(.secondary).lineLimit(1)
        }
      } else {
        Spacer(minLength: 2)
        Text("Aucune mission à venir").font(.system(size: 13)).foregroundColor(.secondary)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetBg()
  }
}
struct NextWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "IntermitrackNext", provider: NextProvider()) { e in NextView(data: e.data) }
      .configurationDisplayName("Prochaine mission")
      .description("Ta prochaine mission d'un coup d'œil.")
      .supportedFamilies([.systemSmall])
  }
}

// MARK: - CALENDRIER DU MOIS
struct CalEntry: TimelineEntry { let date: Date; let data: CalData? }
struct CalProvider: TimelineProvider {
  func placeholder(in c: Context) -> CalEntry { CalEntry(date: Date(), data: nil) }
  func getSnapshot(in c: Context, completion: @escaping (CalEntry) -> Void) { completion(CalEntry(date: Date(), data: loadJSON("widget_calendar"))) }
  func getTimeline(in c: Context, completion: @escaping (Timeline<CalEntry>) -> Void) {
    completion(Timeline(entries: [CalEntry(date: Date(), data: loadJSON("widget_calendar"))], policy: .after(Date().addingTimeInterval(3600))))
  }
}
struct CalCell: View {
  let day: Int; let info: CalDay?; let today: Int; let h: CGFloat; let big: Bool
  var body: some View {
    ZStack {
      if day == today {
        // Aujourd'hui : encadré accent bien visible (comme le repère du jour dans l'app)
        RoundedRectangle(cornerRadius: 5).fill(ORANGE.opacity(0.16))
        RoundedRectangle(cornerRadius: 5).strokeBorder(ORANGE, lineWidth: 2)
        if let i = info, !i.ab.isEmpty {
          VStack(spacing: 0) {
            Text("\(day)").font(.system(size: h * 0.34, weight: .heavy)).foregroundColor(ORANGE)
            Text(i.ab).font(.system(size: h * 0.26, weight: .bold)).foregroundColor(ORANGE).lineLimit(1).minimumScaleFactor(0.6).padding(.horizontal, 1)
          }
        } else {
          Text("\(day)").font(.system(size: h * 0.46, weight: .heavy)).foregroundColor(ORANGE)
        }
      } else if let i = info, !i.g.isEmpty {
        // Jour mission/note : dégradé couleur prod (ou auto passé/futur), hachures si besoin
        RoundedRectangle(cornerRadius: 5).fill(LinearGradient(colors: i.g.map { Color(hexString: $0) }, startPoint: .topLeading, endPoint: .bottomTrailing))
        if i.hach { HachureOverlay().clipShape(RoundedRectangle(cornerRadius: 5)) }
        VStack(spacing: 0) {
          Text(i.ab).font(.system(size: h * (big ? 0.30 : 0.36), weight: .heavy)).foregroundColor(Color(hexString: i.txt)).lineLimit(1).minimumScaleFactor(0.6).padding(.horizontal, 1)
          if big && i.hours > 0 {
            Text("\(fmtHours(i.hours))h\(i.more > 0 ? " ·+\(i.more)" : "")").font(.system(size: h * 0.21, weight: .semibold)).foregroundColor(Color(hexString: i.txt)).opacity(0.9).lineLimit(1).minimumScaleFactor(0.6)
          }
        }
        if !i.note.isEmpty {
          VStack { HStack { Spacer(); Circle().fill(Color(hexString: i.note)).frame(width: big ? 8 : 6, height: big ? 8 : 6).overlay(Circle().stroke(Color.white, lineWidth: 1)) }; Spacer() }.padding(2)
        }
      } else {
        Text("\(day)").font(.system(size: h * 0.42)).foregroundColor(.secondary)
      }
    }.frame(height: h)
  }
}
struct UpcomingRow: View {
  let m: UpNext
  func fmtH(_ h: Double) -> String { h == h.rounded() ? "\(Int(h))" : String(format: "%.1f", h) }
  var body: some View {
    HStack(spacing: 8) {
      RoundedRectangle(cornerRadius: 2).fill(Color(hexString: m.color)).frame(width: 3, height: 24)
      Text(m.date).font(.system(size: 12, weight: .bold)).foregroundColor(.primary).frame(width: 64, alignment: .leading)
      Text(m.prod).font(.system(size: 12, weight: .semibold)).foregroundColor(.primary).lineLimit(1)
      Spacer(minLength: 4)
      Text("\(fmtH(m.hours)) h\(m.price > 0 ? " · \(Int(m.price)) €" : "")").font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
    }
  }
}
struct CalView: View {
  var data: CalData?
  @Environment(\.widgetFamily) var family
  let cols = Array(repeating: GridItem(.flexible(), spacing: 3), count: 7)
  var body: some View {
    let big = family == .systemLarge
    let cellH: CGFloat = big ? 34 : 20
    VStack(alignment: .leading, spacing: big ? 7 : 6) {
      if let cal = data {
        Text(cal.title).font(.system(size: big ? 16 : 14, weight: .heavy)).foregroundColor(.primary)
        let byDay = Dictionary(cal.days.map { ($0.d, $0) }, uniquingKeysWith: { a, _ in a })
        LazyVGrid(columns: cols, spacing: 3) {
          ForEach(Array(["L","M","M","J","V","S","D"].enumerated()), id: \.offset) { _, w in
            Text(w).font(.system(size: big ? 10 : 8, weight: .bold)).foregroundColor(.secondary)
          }
          ForEach(0..<max(0, cal.firstWeekday - 1), id: \.self) { _ in Color.clear.frame(height: cellH) }
          ForEach(1...max(1, cal.daysInMonth), id: \.self) { day in
            CalCell(day: day, info: byDay[day], today: cal.today, h: cellH, big: big)
          }
        }
        if big, let up = cal.upcoming, !up.isEmpty {
          Divider().padding(.vertical, 2)
          ForEach(Array(up.enumerated()), id: \.offset) { _, m in UpcomingRow(m: m) }
        }
        Spacer(minLength: 0)
      } else {
        Text("Ouvre Intermitrack pour afficher ton mois.").font(.system(size: 12)).foregroundColor(.secondary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .widgetBg()
  }
}
struct CalWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "IntermitrackCalendar", provider: CalProvider()) { e in CalView(data: e.data) }
      .configurationDisplayName("Calendrier du mois")
      .description("Tes missions du mois, colorées par prod.")
      .supportedFamilies([.systemMedium, .systemLarge])
  }
}

// MARK: - Bundle
@main
struct IntermitrackWidgets: WidgetBundle {
  var body: some Widget {
    CalWidget()
    HoursWidget()
    NextWidget()
  }
}
