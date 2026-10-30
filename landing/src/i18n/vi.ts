export const vi = {
  nav: {
    brand: 'Open POS',
    tagline: 'Phần mềm POS Mã Nguồn Mở',
    features: 'Tính Năng',
    demo: 'Trải Nghiệm Trực Tiếp',
    architecture: 'Kiến Trúc LAN',
    comparison: 'So Sánh',
    freedom: '100% Miễn Phí',
    faq: 'Hỏi Đáp',
    github: 'Mã Nguồn',
    download: 'Tải Ứng Dụng',
  },
  hero: {
    badge: 'Phần mềm POS Miễn phí 100% & Mã nguồn mở cho Nhà hàng, Quán Café',
    titleLine1: 'Bán hàng trơn tru ngay cả khi',
    titleHighlight: 'đứt mạng Internet.',
    description:
      'Hệ thống điểm bán hàng (POS) thế hệ mới được thiết kế đặc thù cho quán ăn và cà phê. Hoạt động 100% Offline, tự động đồng bộ mạng LAN giữa nhiều máy thu ngân & phục vụ, thanh toán VietQR chuẩn xác, kế toán VND nguyên vẹn không sai lệch 1 xu.',
    ctaDownload: 'Tải Ứng Dụng Miễn Phí',
    ctaGithub: 'Khám Phá Mã Nguồn GitHub',
    ctaDemo: 'Thử Nghiệm Giao Diện Thu Ngân ↓',
    pills: [
      { text: 'Miễn phí vĩnh viễn, 0đ/tháng', icon: 'check' },
      { text: 'Hoạt động 100% Offline', icon: 'wifi-off' },
      { text: 'Đồng bộ LAN PouchDB', icon: 'refresh' },
      { text: 'Tauri 2 siêu nhẹ (~15MB RAM)', icon: 'zap' },
    ],
  },
  stats: {
    stat1Value: '0 ₫',
    stat1Label: 'Chi phí đăng ký hàng tháng',
    stat2Value: '100%',
    stat2Label: 'Khả năng vận hành khi mất Internet',
    stat3Value: '< 15 ms',
    stat3Label: 'Độ trễ đồng bộ mạng nội bộ LAN',
    stat4Value: '0 xu',
    stat4Label: 'Sai số làm tròn số học tiền tệ VND',
  },
  simulator: {
    badge: 'Trải Nghiệm Tương Tác Trực Tiếp',
    title: 'Giao diện thu ngân thực tế của Open POS',
    subtitle:
      'Bấm chọn món ăn thức uống bên dưới, thử điều chỉnh số lượng, chia hóa đơn chuẩn xác và mô phỏng tạo mã thanh toán VietQR.',
    categories: {
      all: 'Tất Cả Món',
      coffee: 'Cà Phê & Trà',
      food: 'Món Ăn',
      dessert: 'Bánh & Tráng Miệng',
    },
    menu: {
      item1: 'Cà Phê Sữa Đá Sài Gòn',
      item1Desc: 'Pha phin truyền thống, sữa đặc thơm béo',
      item2: 'Phở Bò Tái Nạm Đặc Biệt',
      item2Desc: 'Nước dùng ninh xương 12h, thịt bò tươi mềm',
      item3: 'Bánh Mì Chảo Thập Cẩm',
      item3Desc: 'Pate nóng, trứng ốp la, xíu mại và xúc xích',
      item4: 'Trà Đào Cam Sả Tươi',
      item4Desc: 'Hương sả thanh mát, đào giòn ngọt dịu',
      item5: 'Bạc Xỉu 3 Tầng Đá',
      item5Desc: 'Nhiều sữa ít cà phê, béo ngậy ngọt ngào',
      item6: 'Croissant Bơ Tươi Nướng',
      item6Desc: 'Bánh sừng bò ngàn lớp vỏ giòn rụm',
    },
    orderPanel: {
      title: 'Đơn Hàng Thu Ngân',
      table: 'Bàn số 04 — Khu vực Sân Vườn',
      empty: 'Chưa có món nào trong giỏ. Nhấp chọn món từ thực đơn bên trái để bắt đầu.',
      subtotal: 'Tạm tính:',
      discount: 'Giảm giá hội viên (10%):',
      total: 'Tổng thanh toán:',
      btnSplit: 'Chia Tiền Đều',
      btnVietQr: 'Tạo Mã VietQR',
      btnCash: 'Thanh Toán Tiền Mặt',
      splitNotice: 'Chia {count} phần: Mỗi người {amount} ₫ (Thuật toán Largest-Remainder bảo toàn chính xác từng đồng, không làm tròn sai số).',
      paidSuccess: '✓ Đã nhận thanh toán thành công!',
    },
    qrModal: {
      title: 'Mã Thanh Toán VietQR Tức Thì',
      desc: 'Quét bằng mọi ứng dụng ngân hàng (Vietcombank, MB, Techcombank, VPBank...) để thanh toán.',
      accountName: 'OPEN POS VIETNAM CO., LTD',
      bank: 'Vietcombank — 0071001234567',
      transferContent: 'THANH TOAN BAN 04 #HD-8921',
      btnDone: 'Xác Nhận Đã Nhận Tiền',
      btnClose: 'Đóng',
    },
  },
  architecture: {
    badge: 'Kiến Trúc & Bảo Mật',
    title: 'Đồng bộ mạng LAN nội bộ: Mạng đứt, kinh doanh không ngắt',
    subtitle:
      'Không dựa vào máy chủ đám mây xa xôi. Open POS lưu trữ dữ liệu tại chỗ với PouchDB và đồng bộ trực tiếp giữa các thiết bị qua bộ định tuyến Wi-Fi của quán.',
    nodes: {
      hubTitle: 'Máy Thu Ngân Chính (Hub PouchDB)',
      hubDesc: 'Chạy sidecar Hub nhẹ nhàng trên máy tính quầy Bar. Lưu giữ lịch sử đơn hàng, tiếp nhận kết nối LAN.',
      waiterTitle: 'Máy Tính Bảng Order Của Nhân Viên',
      waiterDesc: 'Nhân viên ghi món tại bàn, gửi order tới quầy thu ngân trong <10ms qua mạng nội bộ.',
      kitchenTitle: 'Màn Hình Bếp / Máy In Phiếu (KDS)',
      kitchenDesc: 'Bếp nhận đơn tức thì, in phiếu tự động qua giao thức chuẩn ESC/POS không cần Internet.',
    },
    features: [
      {
        title: 'Bảo Vệ Khỏi Sự Cố Mạng Viễn Thông',
        desc: 'Mất mạng Internet từ nhà mạng không còn là thảm họa. Quán vẫn nhận khách, in bill và thu tiền hoàn toàn bình thường.',
      },
      {
        title: 'Không Độ Trễ Đám Mây (Zero Cloud Latency)',
        desc: 'Mọi thao tác bấm nút phản hồi tức thì 60 FPS, không có biểu tượng xoay vòng chờ máy chủ nước ngoài tải dữ liệu.',
      },
      {
        title: 'Chủ Quyền Dữ Liệu Tuyệt Đối',
        desc: 'Dữ liệu doanh thu, thông tin khách hàng và công thức món ăn thuộc về riêng bạn, lưu an toàn trên máy tính của bạn.',
      },
    ],
  },
  featuresGrid: {
    badge: 'Tính Năng Cốt Lõi',
    title: 'Xây dựng cho tốc độ, độ bền và tính thực chiến',
    subtitle:
      'Mỗi chi tiết kỹ thuật được đo lường kỹ càng để phục vụ giờ cao điểm đông khách nhất của bạn.',
    items: [
      {
        title: 'Kế toán Tiền Tệ VND Nguyên Vẹn',
        desc: 'Sử dụng số nguyên minor units tuyệt đối. Chia hóa đơn với thuật toán Largest-Remainder bảo toàn chính xác từng đồng, loại bỏ hoàn toàn lỗi làm tròn số thực.',
        tag: 'Toán Học Chuẩn Xác',
      },
      {
        title: 'Hệ Thống Type Registry Tùy Biến',
        desc: 'Thoải mái thêm trường dữ liệu tùy biến: mức đường, mức đá, loại sốt, độ chín steak, bàn VIP mà không cần động vào một dòng code.',
        tag: 'Linh Hoạt Đỉnh Cao',
      },
      {
        title: 'Tauri 2 & Rust Siêu Nhẹ',
        desc: 'Chỉ tiêu thụ ~15-25MB RAM, nhanh hơn gấp 10 lần các phần mềm nền Electron. Chạy mượt mà trên cả các máy tính màn hình cảm ứng cũ.',
        tag: 'Hiệu Năng 60 FPS',
      },
      {
        title: 'Thanh Toán VietQR Tiêu Chuẩn',
        desc: 'Sinh mã QR động theo chuẩn Napas247 của Ngân hàng Nhà nước. Tiền vào thẳng tài khoản của chủ quán, không qua bất kỳ ví trung gian nào.',
        tag: 'VietQR Động',
      },
      {
        title: 'Tương Thích Mọi Máy In ESC/POS',
        desc: 'Hỗ trợ máy in hóa đơn nhiệt K80 (80mm) và K58 (58mm) phổ biến qua cổng USB, mạng LAN và Bluetooth mà không ép mua thiết bị chuyên dụng.',
        tag: 'In Nhiệt Chuẩn Hóa',
      },
      {
        title: 'Giao Diện Thiết Kế Tinh Tế',
        desc: 'Dựa trên hệ thống thiết kế hiện đại, độ tương phản cao, phím bấm to rõ ràng tối ưu cho màn hình cảm ứng và giảm nhức mắt khi làm ca dài.',
        tag: 'UI/UX Tối Ưu',
      },
    ],
  },
  comparison: {
    badge: 'Minh Bạch Tuyệt Đối',
    title: 'So Sánh Open POS Với Các Giải Pháp Khác',
    subtitle:
      'Xem xét rõ ràng giữa Open POS mã nguồn mở miễn phí, phần mềm đám mây trả phí tháng và phần mềm cổ điển.',
    colCriterion: 'Tiêu Chí So Sánh',
    colOpenPos: 'Open POS (Mã Nguồn Mở)',
    colCloud: 'POS Đám Mây (SaaS Thu Phí)',
    colLegacy: 'Phần Mềm POS Cũ (Win Cổ)',
    rows: [
      {
        criterion: 'Chi phí phần mềm',
        openPos: '0đ vĩnh viễn (Miễn phí 100%)',
        cloud: '250.000₫ – 600.000₫ / tháng',
        legacy: 'Mua đứt 5.000.000₫ – 15.000.000₫',
      },
      {
        criterion: 'Khi mất mạng Internet',
        openPos: 'Vẫn bán hàng & in bill 100% trơn tru',
        cloud: 'Bị đơ, xoay vòng hoặc ngưng hoạt động',
        legacy: 'Chạy được nhưng không đồng bộ máy con',
      },
      {
        criterion: 'Đồng bộ nhiều máy (LAN)',
        openPos: 'Tự động đồng bộ PouchDB qua Wi-Fi',
        cloud: 'Bắt buộc phải có mạng Internet',
        legacy: 'Cài đặt SQL Server phức tạp, dễ lỗi',
      },
      {
        criterion: 'Quyền sở hữu dữ liệu',
        openPos: 'Bạn giữ 100% trên ổ cứng của mình',
        cloud: 'Lưu trên mây nhà cung cấp, dễ bị khóa',
        legacy: 'Lưu trên file cục bộ dễ hỏng hóc',
      },
      {
        criterion: 'Mức chiếm dụng bộ nhớ RAM',
        openPos: 'Cực nhẹ (~15–25 MB RAM, Tauri 2)',
        cloud: 'Nặng nề (300MB – 1GB RAM trên web)',
        legacy: 'Chiếm tài nguyên, giao diện thô ráp',
      },
      {
        criterion: 'Cộng đồng & Khả năng mở rộng',
        openPos: 'Mã nguồn mở, tùy biến không giới hạn',
        cloud: 'Đóng kín, muốn tính năng mới phải trả thêm',
        legacy: 'Không còn cập nhật tính năng mới',
      },
    ],
  },
  freedom: {
    badge: 'Cam Kết Minh Bạch',
    title: 'Tại sao Open POS lại miễn phí 100%?',
    subtitle:
      'Không có phiên bản dùng thử 14 ngày. Không có tính năng ẩn bắt trả phí. Không bán quảng cáo. Đây là lý do chúng tôi xây dựng dự án này.',
    cards: [
      {
        title: 'Chấm Dứt Gánh Nặng Phí Thuê Bao',
        desc: 'Mỗi quán cà phê hay tiệm ăn nhỏ khi mở ra đã phải gánh vô vàn chi phí mặt bằng, nguyên vật liệu. Một phần mềm quản lý bán hàng thiết yếu không nên là khoản phí đánh thuế hàng tháng vào lợi nhuận của bạn.',
      },
      {
        title: 'Tiền Của Bạn Đi Thẳng Vào Tài Khoản Của Bạn',
        desc: 'Khi khách hàng thanh toán VietQR hoặc tiền mặt, 100% dòng tiền thuộc về chủ quán. Open POS không làm trung gian thanh toán và không cắt bất kỳ phần trăm hoa hồng nào.',
      },
      {
        title: 'Sức Mạnh Từ Cộng Đồng Lập Trình Viên',
        desc: 'Xây dựng với các công nghệ mã nguồn mở hàng đầu thế giới (Vue 3, Tauri 2, Rust, PouchDB). Dự án được kiểm toán minh bạch và phát triển bền vững bởi cộng đồng.',
      },
    ],
  },
  faq: {
    badge: 'Giải Đáp Thắc Mắc',
    title: 'Những câu hỏi thường gặp',
    subtitle: 'Mọi điều bạn cần biết trước khi triển khai Open POS tại cửa hàng.',
    items: [
      {
        q: 'Open POS có thực sự miễn phí 100% không?',
        a: 'Đúng như tên gọi, Open POS là phần mềm mã nguồn mở miễn phí 100%. Bạn có thể tự do tải về, cài đặt cho bao nhiêu máy tính, bao nhiêu chi nhánh tùy thích mà không phải trả bất kỳ chi phí bản quyền nào.',
      },
      {
        q: 'Nếu quán bị đứt mạng Internet, việc bán hàng có bị ảnh hưởng không?',
        a: 'Không hề bị ảnh hưởng. Open POS được thiết kế theo tư duy Offline-First. Toàn bộ cơ sở dữ liệu thực đơn, giá bán, bàn ăn và hóa đơn đều lưu trữ trực tiếp trên máy của bạn. Khi mất Internet, các máy vẫn đồng bộ với nhau qua bộ phát Wi-Fi nội bộ của quán.',
      },
      {
        q: 'Tôi có thể dùng máy in nhiệt và ngăn kéo đựng tiền có sẵn không?',
        a: 'Có. Open POS tương thích hoàn toàn với tất cả các dòng máy in nhiệt tiêu chuẩn ESC/POS (khổ 80mm và 58mm) kết nối qua cổng USB, dây mạng LAN hoặc Bluetooth. Ngăn kéo đựng tiền cắm qua cổng RJ11 của máy in cũng sẽ tự động bật mở khi in hóa đơn.',
      },
      {
        q: 'Làm thế nào để kết nối nhiều máy thu ngân và máy tính bảng order?',
        a: 'Máy thu ngân chính của quán sẽ chạy chức năng Hub (đã tích hợp sẵn trong ứng dụng). Các máy tính bảng order của nhân viên chỉ cần kết nối vào cùng mạng Wi-Fi của quán và điền địa chỉ IP của máy chính để tự động đồng bộ tức thì.',
      },
      {
        q: 'Làm sao để tôi cập nhật phiên bản mới?',
        a: 'Bạn có thể tải các bản phát hành mới nhất từ kho lưu trữ GitHub của dự án hoặc cập nhật trực tiếp trong phần Cài đặt của ứng dụng.',
      },
    ],
  },
  cta: {
    title: 'Sẵn sàng nâng cấp cửa hàng của bạn?',
    subtitle:
      'Tải Open POS ngay hôm nay và trải nghiệm sự tự do: không phí tháng, không phụ thuộc mạng Internet, làm chủ dữ liệu của chính bạn.',
    btnDownload: 'Tải Về Miễn Phí (Windows, macOS, Linux)',
    btnGithub: 'Tham Gia Cộng Đồng GitHub',
    badge: 'Mã Nguồn Mở • Bản Quyền Miễn Phí • An Toàn Tuyệt Đối',
    latest: 'Phiên bản mới nhất',
    loading: 'Đang lấy liên kết tải xuống…',
    downloadFor: 'Tải cho {platform}',
    viewReleases: 'Xem tất cả bản phát hành trên GitHub',
    platforms: {
      windows: { label: 'Windows 10/11', formats: 'MSI / EXE' },
      macos: { label: 'macOS', formats: 'DMG (Universal)' },
      linux: { label: 'Linux', formats: 'AppImage / DEB' },
    },
  },
  footer: {
    brand: 'Open POS',
    desc: 'Hệ thống điểm bán hàng (POS) thế hệ mới Offline-First dành cho nhà hàng, quán cà phê và bán lẻ.',
    navigation: 'Điều Hướng',
    community: 'Cộng Đồng',
    license: 'Giấy phép mã nguồn mở tự do. Được phát triển với niềm đam mê công nghệ và sự tôn trọng đối với các chủ quán ẩm thực.',
    rights: '© 2026 Open POS Project. Tất cả quyền được bảo lưu.',
  },
};
