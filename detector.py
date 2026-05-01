import numpy as np
import cv2

# Faixas de cor em HSV usadas para detectar a cor principal do cartão.
# Algumas cores, como o vermelho, precisam de mais de uma faixa por causa da
# natureza circular do canal Hue no espaço HSV.
COLOR_RANGES = {
    "Vermelho": [
        (np.array([0, 100, 100]),    np.array([10, 255, 255])),
        (np.array([160, 100, 100]),  np.array([180, 255, 255])),
    ],
    "Verde":  [(np.array([35, 80, 80]),   np.array([85, 255, 255]))],
    # Azul escuro: saturação e valor mais baixos, hue alargado
    "Azul":   [(np.array([90, 50, 30]),   np.array([140, 255, 200]))],
    "Branco": [(np.array([0, 0, 180]),    np.array([180, 40, 255]))],
    "Preto":  [(np.array([0, 0, 0]),      np.array([180, 255, 50]))],
}

# Cores neutras não contam como cor principal do cartão.
NEUTRAL_COLORS  = {"Preto", "Branco", "Desconhecido"}

# Área mínima em pixels para considerar uma cor válida.
MIN_AREA        = 2000

# Área mínima do contorno branco interno para tentar classificar a forma.
WHITE_SHAPE_MIN = 500

# Solidez mínima para aceitar o contorno como uma forma plausível.
SOLIDITY_MIN    = 0.70

# Valor de aproximação do contorno: menor valor preserva mais vértices.
APPROX_EPS      = 0.02

# Quantidade de frames consecutivos necessários para confirmar a cor.
APPROACH_FRAMES = 10

# Limite de circularidade usado para reconhecer círculos.
CIRCULARITY_MIN = 0.72


def detect_card_color(roi_hsv):
    """Detecta a cor dominante na região de interesse em HSV.

    Para cada cor definida em COLOR_RANGES, uma máscara é criada e refinada com
    operações morfológicas. A cor com maior área detectada é retornada.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    best_color, best_area = "Desconhecido", 0

    for name, ranges in COLOR_RANGES.items():
        mask = np.zeros(roi_hsv.shape[:2], dtype=np.uint8)
        for lo, hi in ranges:
            mask |= cv2.inRange(roi_hsv, lo, hi)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        area = cv2.countNonZero(mask)
        if area > best_area:
            best_color, best_area = name, area

    return best_color, best_area


def classify_shape(approx, area, perimeter):
    """Classifica a forma com base no contorno aproximado.

    Usa circularidade para reconhecer círculos e número de vértices para
    diferenciar triângulos e quadrados.
    """
    circularity = (4 * np.pi * area / (perimeter ** 2)) if perimeter > 0 else 0

    # Círculo: circularidade alta OU muitos vértices + circularidade razoável
    if circularity >= CIRCULARITY_MIN:
        return "circulo"
    if len(approx) > 8 and circularity >= 0.60:
        return "circulo"

    v = len(approx)
    if v == 3:
        return "triangulo"

    if v == 4:
        return "quadrado"

    return None


def detect_white_shape(roi_hsv):
    """Detecta a forma branca interna do cartão.

    A imagem é segmentada para branco, o ruído é removido e os contornos são
    analisados. O maior contorno válido é escolhido como resultado.
    """
    mask = cv2.inRange(roi_hsv, np.array([0, 0, 180]), np.array([180, 40, 255]))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = (None, None, 0)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < WHITE_SHAPE_MIN:
            continue

        peri   = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, APPROX_EPS * peri, True)

        hull_area = cv2.contourArea(cv2.convexHull(cnt))
        if not hull_area or area / hull_area < SOLIDITY_MIN:
            continue

        shape = classify_shape(approx, area, peri)
        if shape and area > best[2]:
            best = (shape, approx, area)

    return best[0], best[1]


def detectar_cartao():
    """Captura a câmera e tenta identificar um cartão em tempo real.

    O detector analisa a região central da imagem, valida a cor por vários
    frames consecutivos e procura uma forma branca interna para compor o
    resultado final.
    """
    cap = cv2.VideoCapture(0)
    color_frames, detected_color = 0, ""

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        # Analisa apenas a região central da imagem para reduzir falsos positivos.
        x1, y1, x2, y2 = w//4, h//4, 3*w//4, 3*h//4
        roi_hsv = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2HSV)

        color, area  = detect_card_color(roi_hsv)
        shape, s_cnt = detect_white_shape(roi_hsv)

        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 255), 2)
        cv2.imshow("Detector de Cartoes", frame)

        color_valid = color not in NEUTRAL_COLORS and area >= MIN_AREA

        # Primeiro confirma a cor por vários frames consecutivos.
        if not color_valid:
            color_frames, detected_color = 0, ""
        elif not shape:
            detected_color = color
            color_frames  += 1
        # Quando a forma aparece e a cor já foi confirmada, o cartão é detectado.
        elif color_frames >= APPROACH_FRAMES:
            result = {"cor": detected_color, "area_px": area, "forma": shape}
            print(f"Cartão detectado: {result}")
            cap.release()
            cv2.destroyAllWindows()
            return result

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    return None