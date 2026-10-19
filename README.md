# PKG Extractor GUI

Giải nén file PKG game PS4 (game gốc, update, patch/DLC) thành thư mục game để dùng với shadPS4, chỉ bằng vài cú bấm.

## Tải về

**[⬇ Tải bản mới nhất tại trang Releases](https://github.com/ducgao/pkg-extractor-gui/releases/latest)**

Tải file `PKG-Extractor-GUI-x.y.z-portable.exe`, bấm đúp để chạy. Không cần cài đặt.

> Lần đầu mở, Windows có thể hiện cảnh báo SmartScreen vì file chưa được ký số.
> Bấm **More info** → **Run anyway**.

## Hướng dẫn

### 1. Mở ứng dụng

![Mở ứng dụng](docs/images/1-open.png)

### 2. Chọn file và thư mục

- Bấm **Chọn file…** hoặc kéo thả file `.pkg` vào từng ô: **Game gốc**, **Update**, **Patch / DLC**. Không cần điền đủ cả ba.
- Ứng dụng tự nhận diện loại file. Nếu chọn nhầm ô, nó báo ngay và khóa nút Bắt đầu.
- Chọn **Thư mục game** (và **Thư mục addons** nếu có DLC). Ứng dụng nhớ lựa chọn cho lần sau.
- Nếu có nhiều bản update, chọn theo thứ tự cũ → mới.

![Chọn file và thư mục](docs/images/2-select.png)

### 3. Bấm Bắt đầu giải nén

Thanh tiến độ cho biết đang xử lý file nào, đã ghi bao nhiêu và tốc độ. Bấm **Hủy** nếu muốn dừng.

![Đang giải nén](docs/images/3-running.png)

### 4. Xong

Thư mục game tự mở ra. Bấm **Mở thư mục** nếu muốn mở lại.

![Hoàn tất](docs/images/4-done.png)

## Lưu ý

- Ứng dụng chỉ giải nén. Để chơi game vẫn cần [shadPS4](https://github.com/shadps4-emu/shadPS4) và firmware dump từ máy PS4 của chính bạn.
- Dung lượng sau giải nén thường lớn hơn file PKG. Hãy chắc chắn ổ đích còn đủ chỗ.

## Chạy từ mã nguồn

```
npm install
npm start
```

Đóng gói bản portable: `npm run dist` (kết quả nằm trong `dist/`).

## License

GPL-2.0-or-later, xem [LICENSE](LICENSE).

Dự án đóng gói sẵn `pkg_extractor` (bản `PKG_EXTRACTOR_1_1`) từ [ShadPs4Plus](https://github.com/AzaharPlus/shadPS4Plus),
dựa trên mã của [shadPS4](https://github.com/shadps4-emu/shadPS4). Mã nguồn của chúng nằm ở các repo trên;
bản build và license đi kèm nằm trong `vendor/pkg_extractor`.
