# PKG Extractor GUI

Giao diện đồ họa (Electron) cho `pkg_extractor` của [ShadPs4Plus](https://github.com/AzaharPlus/shadPS4Plus):
chọn file PKG game gốc, update, patch/DLC, bấm **Bắt đầu giải nén**, xem tiến độ, xong thì tự mở thư mục.

## Chạy

```
npm install
npm start
```

Cần Windows và Node.js. Chưa có bản đóng gói `.exe`.

## Cách hoạt động

- Mỗi file được kiểm tra bằng `pkg_extractor <file> --check-type` (mã 101 = game gốc, 102 = update/patch, 103 = DLC), nên chọn nhầm file vào sai mục sẽ báo ngay.
- Thứ tự giải nén: game gốc → update → patch/DLC.
- Vị trí đầu ra do `pkg_extractor` quyết định:
  - game gốc → `<thư mục game>\<TitleID>`
  - update/patch → `<thư mục game>\<TitleID>-patch`
  - DLC → `<thư mục addons>\<TitleID>\<label>`
- Tool gốc luôn trả exit code 0 kể cả khi lỗi, nên GUI tự xác nhận thành công bằng dòng kết thúc và việc đủ `N/N` file.
- Nút **Hủy** dừng cả cây tiến trình, không để lại tiến trình ghi đĩa.

## Giới hạn

- GUI chỉ giải nén. Chạy game vẫn cần shadPS4 và firmware dump từ máy PS4 của chính bạn.
- Nếu chọn hai bản update/patch cho cùng một game, bản chọn sau ghi đè lên bản trước trong `-patch`; hãy chọn cũ → mới.
- Thanh tiến độ tính theo số file, không theo dung lượng, nên có thể khựng khi gặp file rất lớn.

## License

GPL-2.0-or-later. Thư mục `vendor/pkg_extractor` chứa bản build sẵn `PKG_EXTRACTOR_1_1` của ShadPs4Plus
(mã nguồn: https://github.com/AzaharPlus/shadPS4Plus, nhánh `ShadPs4Plus`, thư mục `extractor/`),
dựa trên mã của [shadPS4](https://github.com/shadps4-emu/shadPS4). Giữ nguyên thông báo bản quyền và
`LICENSE-GPL-2.0.txt` khi phân phối lại. Nếu phát hành bản đóng gói, kèm link mã nguồn này.
