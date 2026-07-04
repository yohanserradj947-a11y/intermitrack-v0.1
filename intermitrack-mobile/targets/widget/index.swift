import WidgetKit
import SwiftUI

let APP_GROUP = "group.fr.intermitrack.app"
let ORANGE = Color(red: 0.976, green: 0.451, blue: 0.086) // #F97316 (prévues / accent)
let GREEN = Color(red: 0.071, green: 0.459, blue: 0.290) // #12754A (heures effectuées)

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
  var planned: Double { max(0, data.planned ?? 0) }
  var done: Double { max(0, data.done) }
  var target: Double { data.target > 0 ? data.target : 507 }
  var pct: Int { Int(((done + planned) / target * 100).rounded()) }
  var doneFrac: CGFloat { CGFloat(min(1, done / target)) }
  var planFrac: CGFloat { CGFloat(min(max(0, 1 - min(1, done / target)), planned / target)) }
  var restantes: Int { max(0, Int((target - done - planned).rounded())) }
  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text("HEURES / DROITS").font(.system(size: 10, weight: .bold)).foregroundColor(.secondary)
      Spacer(minLength: 0)
      Text("\(pct) %").font(.system(size: 30, weight: .heavy)).foregroundColor(pct >= 100 ? GREEN : .primary)
      // Barre : effectuées (vert) + prévues (orange)
      GeometryReader { geo in
        let w = geo.size.width
        ZStack(alignment: .leading) {
          RoundedRectangle(cornerRadius: 6).fill(Color.secondary.opacity(0.18))
          HStack(spacing: 0) {
            Rectangle().fill(GREEN).frame(width: w * doneFrac)
            Rectangle().fill(ORANGE).frame(width: w * planFrac)
          }.clipShape(RoundedRectangle(cornerRadius: 6))
        }
      }.frame(height: 12)
      HStack(spacing: 10) {
        HStack(spacing: 4) { Circle().fill(GREEN).frame(width: 7, height: 7); Text("\(Int(done)) h faites").font(.system(size: 10.5, weight: .bold)).foregroundColor(.primary) }
        HStack(spacing: 4) { Circle().fill(ORANGE).frame(width: 7, height: 7); Text("\(Int(planned)) h prév.").font(.system(size: 10.5, weight: .bold)).foregroundColor(.primary) }
      }
      Spacer(minLength: 0)
      Text(restantes > 0 ? "sur 507 h · \(restantes) h restantes" : "507 h atteint !").font(.system(size: 9.5, weight: .semibold)).foregroundColor(pct >= 100 ? GREEN : .secondary).lineLimit(1).minimumScaleFactor(0.7)
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
  var isToday: Bool { day == today }
  var mission: CalDay? { if let i = info, !i.g.isEmpty { return i }; return nil }
  var body: some View {
    if big { bigCell } else { compactCell }
  }
  // GRAND widget : numéro en haut (aujourd'hui = pastille) + bande d'initiales de la mission dessous
  var bigCell: some View {
    VStack(spacing: 1.5) {
      ZStack {
        if isToday { Circle().fill(ORANGE).frame(width: h * 0.44, height: h * 0.44) }
        Text("\(day)").font(.system(size: h * 0.28, weight: isToday ? .bold : .medium)).foregroundColor(isToday ? .white : .primary)
      }
      .frame(height: h * 0.44)
      if let i = mission {
        ZStack {
          RoundedRectangle(cornerRadius: 3).fill(LinearGradient(colors: i.g.map { Color(hexString: $0) }, startPoint: .leading, endPoint: .trailing))
          if i.hach { HachureOverlay().clipShape(RoundedRectangle(cornerRadius: 3)) }
          Text(i.ab).font(.system(size: h * 0.24, weight: .heavy)).foregroundColor(Color(hexString: i.txt)).lineLimit(1).minimumScaleFactor(0.5).padding(.horizontal, 1)
          noteDot(5)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        Spacer(minLength: 0)
      }
    }
    .frame(height: h)
  }
  // MOYEN widget (court) : lisibilité max — fond coloré par prod + gros numéro centré (style iPhone)
  var compactCell: some View {
    ZStack {
      if let i = mission {
        RoundedRectangle(cornerRadius: 4).fill(LinearGradient(colors: i.g.map { Color(hexString: $0) }, startPoint: .topLeading, endPoint: .bottomTrailing))
        if i.hach { HachureOverlay().clipShape(RoundedRectangle(cornerRadius: 4)) }
      }
      if isToday { Circle().fill(ORANGE).frame(width: h * 0.80, height: h * 0.80) }
      Text("\(day)")
        .font(.system(size: h * 0.46, weight: (isToday || mission != nil) ? .heavy : .medium))
        .foregroundColor(isToday ? .white : (mission.map { Color(hexString: $0.txt) } ?? .primary))
        .minimumScaleFactor(0.6)
      if !isToday { noteDot(6) }
    }
    .frame(height: h)
  }
  @ViewBuilder func noteDot(_ size: CGFloat) -> some View {
    if let i = info, !i.note.isEmpty {
      VStack { HStack { Spacer(); Circle().fill(Color(hexString: i.note)).frame(width: size, height: size).overlay(Circle().stroke(Color.white, lineWidth: 0.5)) }; Spacer() }.padding(1.5)
    }
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
// Mini-case du calendrier (colonne de gauche du widget moyen)
struct MiniCell: View {
  let day: Int; let info: CalDay?; let today: Int
  var isToday: Bool { day == today }
  var mission: CalDay? { if let i = info, !i.g.isEmpty { return i }; return nil }
  var body: some View {
    ZStack {
      if let m = mission { RoundedRectangle(cornerRadius: 2.5).fill(LinearGradient(colors: m.g.map { Color(hexString: $0) }, startPoint: .topLeading, endPoint: .bottomTrailing)) }
      if isToday { Circle().fill(ORANGE).frame(width: 15, height: 15) }
      Text("\(day)").font(.system(size: 8, weight: (isToday || mission != nil) ? .heavy : .medium)).foregroundColor(isToday ? .white : (mission.map { Color(hexString: $0.txt) } ?? .primary)).minimumScaleFactor(0.7)
    }.frame(height: 15)
  }
}
struct CalView: View {
  var data: CalData?
  @Environment(\.widgetFamily) var family
  let cols = Array(repeating: GridItem(.flexible(), spacing: 3), count: 7)
  var body: some View {
    if let cal = data {
      if family == .systemLarge { monthView(cal) } else { agendaView(cal) }
    } else {
      Text("Ouvre Intermitrack pour afficher tes missions.")
        .font(.system(size: 12)).foregroundColor(.secondary)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .widgetBg()
    }
  }
  // GRAND : mois complet + prochaines missions (le format qui plaît)
  func monthView(_ cal: CalData) -> some View {
    let leading = max(0, cal.firstWeekday - 1)
    let byDay = Dictionary(cal.days.map { ($0.d, $0) }, uniquingKeysWith: { a, _ in a })
    return VStack(alignment: .leading, spacing: 6) {
      Text(cal.title).font(.system(size: 16, weight: .heavy)).foregroundColor(.primary)
      HStack(spacing: 3) {
        ForEach(Array(["L","M","M","J","V","S","D"].enumerated()), id: \.offset) { _, w in
          Text(w).font(.system(size: 10, weight: .bold)).foregroundColor(.secondary).frame(maxWidth: .infinity)
        }
      }
      LazyVGrid(columns: cols, spacing: 3) {
        ForEach(0..<leading, id: \.self) { _ in Color.clear.frame(height: 34) }
        ForEach(1...max(1, cal.daysInMonth), id: \.self) { day in
          CalCell(day: day, info: byDay[day], today: cal.today, h: 34, big: true)
        }
      }
      if let up = cal.upcoming, !up.isEmpty {
        Divider().padding(.vertical, 1)
        ForEach(Array(up.enumerated()), id: \.offset) { _, m in UpcomingRow(m: m) }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .widgetBg()
  }
  // MOYEN : mini-calendrier du mois (gauche) + prochaines missions (droite), façon Calendrier iPhone
  func agendaView(_ cal: CalData) -> some View {
    let leading = max(0, cal.firstWeekday - 1)
    let byDay = Dictionary(cal.days.map { ($0.d, $0) }, uniquingKeysWith: { a, _ in a })
    let miniCols = Array(repeating: GridItem(.flexible(), spacing: 2), count: 7)
    return HStack(alignment: .top, spacing: 12) {
      // GAUCHE : mini-calendrier des jours
      VStack(alignment: .leading, spacing: 3) {
        Text(cal.title).font(.system(size: 11, weight: .heavy)).foregroundColor(.primary).lineLimit(1)
        LazyVGrid(columns: miniCols, spacing: 2) {
          ForEach(Array(["L","M","M","J","V","S","D"].enumerated()), id: \.offset) { _, w in
            Text(w).font(.system(size: 6.5, weight: .bold)).foregroundColor(.secondary).frame(maxWidth: .infinity)
          }
          ForEach(0..<leading, id: \.self) { _ in Color.clear.frame(height: 15) }
          ForEach(1...max(1, cal.daysInMonth), id: \.self) { day in
            MiniCell(day: day, info: byDay[day], today: cal.today)
          }
        }
      }
      .frame(width: 152)
      // DROITE : prochaines missions
      VStack(alignment: .leading, spacing: 7) {
        Text("À VENIR").font(.system(size: 9.5, weight: .heavy)).foregroundColor(ORANGE)
        if let up = cal.upcoming, !up.isEmpty {
          ForEach(Array(up.prefix(3).enumerated()), id: \.offset) { _, m in
            HStack(spacing: 7) {
              RoundedRectangle(cornerRadius: 2).fill(Color(hexString: m.color)).frame(width: 4, height: 26)
              VStack(alignment: .leading, spacing: 1) {
                Text(m.prod).font(.system(size: 13, weight: .heavy)).foregroundColor(.primary).lineLimit(1)
                Text("\(m.date) · \(fmtHours(m.hours)) h").font(.system(size: 10, weight: .medium)).foregroundColor(.secondary).lineLimit(1)
              }
              Spacer(minLength: 0)
            }
          }
        } else {
          Text("Aucune mission à venir").font(.system(size: 12)).foregroundColor(.secondary)
        }
        Spacer(minLength: 0)
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
